import type { ImageAsset, Note } from './data';
import type { NotesRepository, Unsubscribe } from './notes-repository';

/**
 * filesystem driver (最小実験版)。`VITE_STORAGE_DRIVER=fs` の時に選択され、dev サーバーに
 * 同居する `/api/notes` middleware (vite-fs-notes-plugin) 経由で vault の .md を読み書きする。
 *
 * スコープ (issue #78 の最小実験):
 * - notes の read / list / create / save / delete / rename のみ対応する。
 * - 画像 (imageAssets) と wikilink は未対応。画像系メソッドは no-op / 空配列を返す。
 * - 別プロセス (Claude Code 等) の外部編集は `/api/notes/events` (SSE) を購読して auto-reload する
 *   (issue #87)。SSE が使えない環境 (EventSource 不在) では自アプリ内の編集後のみ再 fetch して通知する。
 * - lastOpenedPath は vault を汚さないよう localStorage に保持する (UI state であり vault の中身ではない)。
 */

const BASE = '/api/notes';
const EVENTS_URL = `${BASE}/events`;
const LAST_OPENED_KEY = 'aze:fs:lastOpenedPath';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`fs driver request failed (${res.status}) ${url}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export class FsNotesRepository implements NotesRepository {
  private noteListeners = new Set<(notes: Note[]) => void>();
  private eventSource: EventSource | null = null;

  constructor() {
    // subscribe* は app 層で `useRepositorySubscription(notesRepository.subscribeNotes)` のように
    // メソッド参照として unbound に渡される。IndexedDB driver は `this` を参照しないため動くが、
    // 本 driver は `this.noteListeners` 等に触れるため、ここで bind して unbound 呼び出しに耐える。
    this.subscribeNotes = this.subscribeNotes.bind(this);
    this.subscribeImageAssets = this.subscribeImageAssets.bind(this);
  }

  private async loadNotes(): Promise<Note[]> {
    const { notes } = await requestJson<{ notes: Note[] }>(BASE);
    return notes;
  }

  private async notifyNotes(): Promise<void> {
    const notes = await this.loadNotes();
    for (const listener of this.noteListeners) {
      listener(notes);
    }
  }

  subscribeNotes(listener: (notes: Note[]) => void): Unsubscribe {
    this.noteListeners.add(listener);
    this.ensureEventSource();
    void this.loadNotes().then((notes) => {
      if (this.noteListeners.has(listener)) {
        listener(notes);
      }
    });
    return () => {
      this.noteListeners.delete(listener);
      if (this.noteListeners.size === 0) {
        this.closeEventSource();
      }
    };
  }

  /**
   * `/api/notes/events` (SSE) を 1 本だけ張り、外部編集の push を受けて全 listener へ再通知する。
   * EventSource は接続断時に自動再接続するため、dev サーバー再起動も透過的に復帰する。
   * EventSource 非対応環境 (テストの jsdom 等) では auto-reload を諦め、従来の手動再 fetch のみとする。
   */
  private ensureEventSource(): void {
    if (this.eventSource || typeof EventSource === 'undefined') return;
    const source = new EventSource(EVENTS_URL);
    source.addEventListener('change', () => {
      void this.notifyNotes().catch(() => {
        // 一時的な fetch 失敗は無視する。次の push か手動操作で再同期される。
      });
    });
    this.eventSource = source;
  }

  private closeEventSource(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  subscribeImageAssets(listener: (assets: ImageAsset[]) => void): Unsubscribe {
    // 画像は最小実験のスコープ外。購読開始直後に空配列を 1 度だけ通知する。
    listener([]);
    return () => {
      // 通知することがないので解除も no-op。
    };
  }

  getAllNotes(): Promise<Note[]> {
    return this.loadNotes();
  }

  async getAllImageAssets(): Promise<ImageAsset[]> {
    return [];
  }

  async getNote(path: string): Promise<Note | undefined> {
    const res = await fetch(`${BASE}/one?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`fs driver getNote failed (${res.status}): ${path}`);
    }
    const { note } = (await res.json()) as { note: Note };
    return note;
  }

  async getLastOpenedPath(): Promise<string | undefined> {
    return localStorage.getItem(LAST_OPENED_KEY) ?? undefined;
  }

  async setLastOpenedPath(path: string): Promise<void> {
    localStorage.setItem(LAST_OPENED_KEY, path);
  }

  async createNote(note: Note): Promise<void> {
    await this.writeNote(note);
  }

  async saveNote(note: Note): Promise<void> {
    // 画像 prune は fs driver では未対応 (画像はスコープ外) のため、本文の書き込みのみ行う。
    await this.writeNote(note);
  }

  private async writeNote(note: Note): Promise<void> {
    await requestJson(`${BASE}/one`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    await this.notifyNotes();
  }

  async deleteNote(path: string): Promise<void> {
    await requestJson(`${BASE}/one?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    await this.notifyNotes();
  }

  async renameNote(note: Note, newPath: string, updateLastOpened: boolean): Promise<void> {
    await requestJson(`${BASE}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: note.path, newPath }),
    });
    if (updateLastOpened) {
      localStorage.setItem(LAST_OPENED_KEY, newPath);
    }
    await this.notifyNotes();
  }

  async addImageAssets(): Promise<void> {
    console.warn('[aze] fs driver: 画像の保存は未対応です (issue #78 最小実験のスコープ外)。');
  }

  async pruneImageAssets(): Promise<void> {
    // 画像はスコープ外。prune 対象が存在しないため何もしない。
  }
}
