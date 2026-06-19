import type { ImageAsset, Note } from './data';
import type { NotesRepository, Unsubscribe } from './notes-repository';

/**
 * filesystem driver (最小実験版)。`VITE_STORAGE_DRIVER=fs` の時に選択され、dev サーバーに
 * 同居する `/api/notes` middleware (vite-fs-notes-plugin) 経由で vault の .md を読み書きする。
 *
 * スコープ (issue #78 の最小実験):
 * - notes の read / list / create / save / delete / rename のみ対応する。
 * - 画像 (imageAssets) と wikilink は未対応。画像系メソッドは no-op / 空配列を返す。
 * - file watch による auto-reload は持たない。自アプリ内の編集後のみ再 fetch して通知する。
 *   別プロセス (Claude Code 等) の編集はリロードするまで反映されない。
 * - lastOpenedPath は vault を汚さないよう localStorage に保持する (UI state であり vault の中身ではない)。
 */

const BASE = '/api/notes';
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
    void this.loadNotes().then((notes) => {
      if (this.noteListeners.has(listener)) {
        listener(notes);
      }
    });
    return () => {
      this.noteListeners.delete(listener);
    };
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
