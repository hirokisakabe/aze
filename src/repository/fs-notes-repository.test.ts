import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FsNotesRepository } from './fs-notes-repository';

import type { Note } from '../lib/data';

const NOTES: Note[] = [{ path: 'a.md', created: '2024-01-01', updated: '2024-01-02', body: '# a' }];

/** auto-reload (SSE) 用の最小 EventSource スタブ。生成インスタンスを記録し、change を手動 dispatch できる。 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  private listeners = new Map<string, Set<() => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ notes: NOTES }), { status: 200 }))
  );
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
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

  it('複数 subscribe でも EventSource は 1 本だけ張る', () => {
    const repo = new FsNotesRepository();
    const unsub1 = repo.subscribeNotes(vi.fn());
    const unsub2 = repo.subscribeNotes(vi.fn());

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/notes/events');

    unsub1();
    unsub2();
  });

  it('change イベントで再 fetch し全 listener へ通知する', async () => {
    const repo = new FsNotesRepository();
    const listener = vi.fn();
    const unsubscribe = repo.subscribeNotes(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(NOTES));
    listener.mockClear();

    // 外部編集を模した change push → re-fetch → 再通知。
    MockEventSource.instances[0].emit('change');
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(NOTES));

    unsubscribe();
  });

  it('getMountInfo は server meta から mountPath を取得する', async () => {
    const mountPath = '/Users/example/very/long/notes/path';
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ mountPath }), { status: 200 })
    );

    const repo = new FsNotesRepository();

    await expect(repo.getMountInfo()).resolves.toEqual({ mountPath });
    expect(fetch).toHaveBeenCalledWith('/api/notes/meta', undefined);
  });

  it('最後の unsubscribe で EventSource を閉じ、再 subscribe で張り直す', () => {
    const repo = new FsNotesRepository();
    const unsub1 = repo.subscribeNotes(vi.fn());
    const unsub2 = repo.subscribeNotes(vi.fn());
    const source = MockEventSource.instances[0];

    unsub1();
    expect(source.closed).toBe(false); // まだ購読が残る
    unsub2();
    expect(source.closed).toBe(true); // 最後の解除で閉じる

    // 再購読すると新しい接続を張る。
    const unsub3 = repo.subscribeNotes(vi.fn());
    expect(MockEventSource.instances).toHaveLength(2);
    unsub3();
  });
});
