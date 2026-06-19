import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import App from './app';
import { db } from './db';
import {
  NOTE_A,
  NOTE_B,
  resetStateBeforeEach,
  findSidebarText,
  openNoteActions,
} from './test-support/app-test-helpers';

resetStateBeforeEach();

describe('既存ノートのパスを変更できる', () => {
  it('ファイル名だけを変更し、DB と現在選択中ノートを新しい path に更新する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    await db.settings.put({ key: 'lastOpenedPath', value: 'note-a.md' });
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'renamed-note.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      const renamed = await db.notes.get('renamed-note.md');
      expect(renamed?.body).toBe(NOTE_A.body);
      expect(renamed?.created).toBe(NOTE_A.created);
      expect(renamed?.updated).toBe(NOTE_A.updated);
    });
    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('renamed-note');
    });
    expect((await db.settings.get('lastOpenedPath'))?.value).toBe('renamed-note.md');
  });

  it('ノートの path 変更時に画像アセットの notePath も更新する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    await db.imageAssets.put({
      id: 'asset-a',
      notePath: 'note-a.md',
      filename: 'a.png',
      mimeType: 'image/png',
      blob: new Blob(['a'], { type: 'image/png' }),
      created: '2024-01-01',
    });
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'renamed-note.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect((await db.imageAssets.get('asset-a'))?.notePath).toBe('renamed-note.md');
    });
  });

  it('フォルダを含む path に移動するとサイドバーとパンくずが新しい path を表示する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/note-a.md');
    await userEvent.keyboard('{Enter}');

    await findSidebarText('archive');
    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('archive');
      expect(document.querySelector('.crumb')?.textContent).toContain('note-a');
    });
    expect(await db.notes.get('note-a.md')).toBeUndefined();
    expect(await db.notes.get('archive/note-a.md')).toBeDefined();
  });

  it('既存 path と衝突する場合は変更せずエラーを表示する', async () => {
    await db.notes.bulkPut([NOTE_A, NOTE_B]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'note-b.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「note-b.md」は既に存在します。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect((await db.notes.get('note-b.md'))?.body).toBe(NOTE_B.body);
  });

  it('ファイル名を含まない path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('ファイル名を含むパスを入力してください。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('archive/.md')).toBeUndefined();
  });

  it('先頭スラッシュと重複スラッシュは正規化して変更する', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, '/archive//note-a.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      expect(await db.notes.get('archive/note-a.md')).toBeDefined();
    });
  });

  it('親ディレクトリ参照を含む path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, '../note-a.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('../note-a.md')).toBeUndefined();
  });

  it('カレントディレクトリ参照を含む path には変更しない', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'archive/./note-a.md');
    await userEvent.keyboard('{Enter}');

    await screen.findByRole('alert');
    expect(screen.getByText('「.」または「..」を含むパスは使えません。')).not.toBeNull();
    expect(await db.notes.get('note-a.md')).toBeDefined();
    expect(await db.notes.get('archive/./note-a.md')).toBeUndefined();
  });

  it('編集中の現在ノートを変更すると draft は画面上に保持され、保存時に新 path へ保存される', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nDraft before rename.');

    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'draft-renamed.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      expect(await db.notes.get('note-a.md')).toBeUndefined();
      expect((await db.notes.get('draft-renamed.md'))?.body).toBe(NOTE_A.body);
    });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '# Note A\n\nDraft before rename.'
    );
    await userEvent.click(screen.getByText(/保存/));
    await screen.findByText('Draft before rename.');
    expect((await db.notes.get('draft-renamed.md'))?.body).toBe('# Note A\n\nDraft before rename.');
  });

  it('編集中に path を変更してから ESC すると draft は破棄される', async () => {
    await db.notes.bulkPut([NOTE_A]);
    render(<App />);

    await screen.findByText('Content of note A.');
    await userEvent.click(screen.getByTitle('編集 (E)'));
    const textarea = screen.getByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, '# Note A\n\nDiscard after rename.');

    await openNoteActions('Note A');
    await userEvent.click(screen.getByText('パス変更'));

    const input = screen.getByPlaceholderText('archive/note.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'discard-renamed.md');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(document.querySelector('.crumb')?.textContent).toContain('discard-renamed');
    });
    await userEvent.keyboard('{Escape}');

    await screen.findByText('Content of note A.');
    expect(screen.queryByText('Discard after rename.')).toBeNull();
    expect((await db.notes.get('discard-renamed.md'))?.body).toBe(NOTE_A.body);
  });
});
