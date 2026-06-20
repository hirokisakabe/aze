import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from './db';
import { IndexedDbNotesRepository } from './notes-repository';

import type { ImageAsset, Note } from './data';

// 本 suite は app の DOM テスト経由ではなく IndexedDbNotesRepository を直接
// インスタンス化して検証する。特に NotesRepository interface が contract として
// 明記している「複数テーブルにまたがる更新は caller から見て all-or-nothing」を、
// 正常系 (1 呼び出しで両テーブルが揃って更新される) と
// 失敗系 (途中でエラーが起きたら何も適用されずロールバックする) の双方で確かめる。
//
// fake-indexeddb は `*.dom.test.ts` 用の setup (src/test-support/setup.ts) で
// 読み込まれるため、ここでは db テーブルを clear するだけでよい。

const repo = new IndexedDbNotesRepository();

const LAST_OPENED_PATH = 'lastOpenedPath';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    path: 'note.md',
    created: '2024-01-01',
    updated: '2024-01-01',
    body: '# Note',
    ...overrides,
  };
}

function makeAsset(id: string, notePath: string, overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id,
    notePath,
    filename: `${id}.png`,
    mimeType: 'image/png',
    blob: new Blob([id], { type: 'image/png' }),
    created: '2024-01-01',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.notes.clear();
  await db.settings.clear();
  await db.imageAssets.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IndexedDbNotesRepository', () => {
  describe('saveNote', () => {
    it('本文の保存と未参照画像の prune を 1 呼び出しで両方適用する', async () => {
      await db.notes.put(makeNote({ body: '# old' }));
      await db.imageAssets.bulkAdd([
        makeAsset('referenced', 'note.md'),
        makeAsset('stale', 'note.md'),
      ]);

      await repo.saveNote(makeNote({ body: '# new' }), ['referenced']);

      expect((await db.notes.get('note.md'))?.body).toBe('# new');
      expect(await db.imageAssets.get('referenced')).toBeDefined();
      expect(await db.imageAssets.get('stale')).toBeUndefined();
    });

    it('prune が途中で失敗したら本文保存もロールバックする (all-or-nothing)', async () => {
      await db.notes.put(makeNote({ body: '# old' }));
      await db.imageAssets.bulkAdd([
        makeAsset('referenced', 'note.md'),
        makeAsset('stale', 'note.md'),
      ]);

      // prune 内の bulkDelete を失敗させ、トランザクションを中断させる。
      vi.spyOn(db.imageAssets, 'bulkDelete').mockRejectedValueOnce(new Error('boom'));

      await expect(repo.saveNote(makeNote({ body: '# new' }), ['referenced'])).rejects.toThrow();

      // 本文更新は適用されず、stale 画像も残ったまま (caller から見て何も起きていない)。
      expect((await db.notes.get('note.md'))?.body).toBe('# old');
      expect(await db.imageAssets.get('stale')).toBeDefined();
    });
  });

  describe('deleteNote', () => {
    it('note と紐づく画像のみを同時に削除し、他 note の画像は残す', async () => {
      await db.notes.bulkPut([makeNote(), makeNote({ path: 'other.md' })]);
      await db.imageAssets.bulkAdd([
        makeAsset('a1', 'note.md'),
        makeAsset('a2', 'note.md'),
        makeAsset('other', 'other.md'),
      ]);

      await repo.deleteNote('note.md');

      expect(await db.notes.get('note.md')).toBeUndefined();
      expect(await db.imageAssets.get('a1')).toBeUndefined();
      expect(await db.imageAssets.get('a2')).toBeUndefined();
      expect(await db.notes.get('other.md')).toBeDefined();
      expect(await db.imageAssets.get('other')).toBeDefined();
    });

    it('画像削除が途中で失敗したら note 削除もロールバックする (all-or-nothing)', async () => {
      await db.notes.put(makeNote());
      await db.imageAssets.bulkAdd([makeAsset('a1', 'note.md')]);

      // 画像削除フェーズ (where('notePath')) を失敗させる。
      vi.spyOn(db.imageAssets, 'where').mockImplementationOnce(() => {
        throw new Error('boom');
      });

      await expect(repo.deleteNote('note.md')).rejects.toThrow();

      expect(await db.notes.get('note.md')).toBeDefined();
      expect(await db.imageAssets.get('a1')).toBeDefined();
    });
  });

  describe('renameNote', () => {
    it('path 変更・画像 notePath の追従・lastOpenedPath 更新を 1 呼び出しで揃って適用する', async () => {
      const note = makeNote({ path: 'old.md' });
      await db.notes.put(note);
      await db.imageAssets.bulkAdd([makeAsset('a1', 'old.md'), makeAsset('a2', 'old.md')]);
      await db.settings.put({ key: LAST_OPENED_PATH, value: 'old.md' });

      await repo.renameNote(note, 'new.md', true);

      expect(await db.notes.get('old.md')).toBeUndefined();
      expect(await db.notes.get('new.md')).toBeDefined();
      expect((await db.imageAssets.get('a1'))?.notePath).toBe('new.md');
      expect((await db.imageAssets.get('a2'))?.notePath).toBe('new.md');
      expect((await db.settings.get(LAST_OPENED_PATH))?.value).toBe('new.md');
    });

    it('updateLastOpened が false なら lastOpenedPath を更新しない', async () => {
      const note = makeNote({ path: 'old.md' });
      await db.notes.put(note);
      await db.settings.put({ key: LAST_OPENED_PATH, value: 'other.md' });

      await repo.renameNote(note, 'new.md', false);

      expect(await db.notes.get('new.md')).toBeDefined();
      expect((await db.settings.get(LAST_OPENED_PATH))?.value).toBe('other.md');
    });

    it('lastOpenedPath 更新が失敗したら path 変更・画像追従もロールバックする (all-or-nothing)', async () => {
      const note = makeNote({ path: 'old.md' });
      await db.notes.put(note);
      await db.imageAssets.bulkAdd([makeAsset('a1', 'old.md')]);
      await db.settings.put({ key: LAST_OPENED_PATH, value: 'old.md' });

      // 最後の settings.put を失敗させ、notes / imageAssets への変更が巻き戻ることを確かめる。
      vi.spyOn(db.settings, 'put').mockRejectedValueOnce(new Error('boom'));

      await expect(repo.renameNote(note, 'new.md', true)).rejects.toThrow();

      expect(await db.notes.get('old.md')).toBeDefined();
      expect(await db.notes.get('new.md')).toBeUndefined();
      expect((await db.imageAssets.get('a1'))?.notePath).toBe('old.md');
      expect((await db.settings.get(LAST_OPENED_PATH))?.value).toBe('old.md');
    });
  });

  describe('pruneImageAssets', () => {
    it('指定 note の画像のうち参照されていないものだけを削除する', async () => {
      await db.imageAssets.bulkAdd([
        makeAsset('referenced', 'note.md'),
        makeAsset('stale', 'note.md'),
        makeAsset('other', 'other.md'),
      ]);

      await repo.pruneImageAssets('note.md', ['referenced']);

      expect(await db.imageAssets.get('referenced')).toBeDefined();
      expect(await db.imageAssets.get('stale')).toBeUndefined();
      // 別 note の画像は参照リストに無くても触らない。
      expect(await db.imageAssets.get('other')).toBeDefined();
    });

    it('参照リストが空なら指定 note の画像をすべて削除する', async () => {
      await db.imageAssets.bulkAdd([
        makeAsset('a1', 'note.md'),
        makeAsset('a2', 'note.md'),
        makeAsset('other', 'other.md'),
      ]);

      await repo.pruneImageAssets('note.md', []);

      expect(await db.imageAssets.get('a1')).toBeUndefined();
      expect(await db.imageAssets.get('a2')).toBeUndefined();
      expect(await db.imageAssets.get('other')).toBeDefined();
    });
  });

  describe('getLastOpenedPath / setLastOpenedPath', () => {
    it('未設定なら undefined を返す', async () => {
      expect(await repo.getLastOpenedPath()).toBeUndefined();
    });

    it('設定した path を読み戻せ、上書きもできる', async () => {
      await repo.setLastOpenedPath('note.md');
      expect(await repo.getLastOpenedPath()).toBe('note.md');

      await repo.setLastOpenedPath('renamed.md');
      expect(await repo.getLastOpenedPath()).toBe('renamed.md');
    });
  });
});
