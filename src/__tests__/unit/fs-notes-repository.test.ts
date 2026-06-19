import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FsNotesRepository } from '../../fs-notes-repository';
import type { Note } from '../../data';

const NOTES: Note[] = [{ path: 'a.md', created: '2024-01-01', updated: '2024-01-02', body: '# a' }];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ notes: NOTES }), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FsNotesRepository', () => {
  // app 層は `useRepositorySubscription(notesRepository.subscribeNotes)` のように
  // メソッドを unbound 参照で渡す。bind されていないと `this.noteListeners` 参照で
  // 落ちて App ごと描画失敗する (issue #78 の回帰)。
  it('subscribeNotes を unbound 参照で呼んでも this を失わない', async () => {
    const repo = new FsNotesRepository();
    const { subscribeNotes } = repo;
    const listener = vi.fn();

    const unsubscribe = subscribeNotes(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(NOTES));
    unsubscribe();
  });

  it('subscribeImageAssets を unbound 参照で呼んでも空配列を通知する', () => {
    const repo = new FsNotesRepository();
    const { subscribeImageAssets } = repo;
    const listener = vi.fn();

    const unsubscribe = subscribeImageAssets(listener);
    expect(listener).toHaveBeenCalledWith([]);
    unsubscribe();
  });
});
