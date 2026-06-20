import { liveQuery } from 'dexie';

import { db } from './db';
import { FsNotesRepository } from './fs-notes-repository';

import type { ImageAsset, Note } from '../lib/data';

export type Unsubscribe = () => void;

/**
 * Storage abstraction for aze. UI 層は本 interface 経由でのみ notes / imageAssets /
 * settings にアクセスし、具体的な driver (現状は IndexedDB / Dexie) を知らない。
 *
 * 設計方針:
 * - reactivity は Dexie 固有の `useLiveQuery` を漏らさず、`subscribe*` で表現する。
 *   driver 側は live query / file watch など任意の手段で実装してよい。
 * - 複数テーブルにまたがる更新 (note 保存時の画像 prune、削除、リネーム、画像追加) は
 *   呼び出し側に atomic 性を意識させないよう、1 メソッドにまとめる。これらは caller から見て
 *   all-or-nothing であることを contract とする (UI は部分適用されない前提で使う)。
 *   IndexedDB driver は transaction で実現するが、transaction を持たない driver
 *   (filesystem 等) でも補償処理や一時領域で caller-visible な atomicity を保つこと。
 */
export interface NotesRepository {
  /** notes 全件の変化を購読する。購読開始直後に現在値が 1 度通知される。 */
  subscribeNotes(listener: (notes: Note[]) => void): Unsubscribe;
  /** imageAssets 全件の変化を購読する。購読開始直後に現在値が 1 度通知される。 */
  subscribeImageAssets(listener: (assets: ImageAsset[]) => void): Unsubscribe;

  /** notes 全件を 1 度だけ取得する (export 用)。 */
  getAllNotes(): Promise<Note[]>;
  /** imageAssets 全件を 1 度だけ取得する (export 用)。 */
  getAllImageAssets(): Promise<ImageAsset[]>;
  /** 指定 path の note を取得する。存在しなければ undefined。 */
  getNote(path: string): Promise<Note | undefined>;

  /** 最後に開いた note の path を取得する。未設定なら undefined。 */
  getLastOpenedPath(): Promise<string | undefined>;
  /** 最後に開いた note の path を保存する。 */
  setLastOpenedPath(path: string): Promise<void>;

  /** 新規 note を保存する。 */
  createNote(note: Note): Promise<void>;
  /**
   * note 本文を保存し、本文から参照されなくなった画像を同時に削除する。
   * `referencedAssetIds` は保存後の本文が参照する asset id の一覧。
   */
  saveNote(note: Note, referencedAssetIds: string[]): Promise<void>;
  /** note を削除し、その note に紐づく画像も同時に削除する。 */
  deleteNote(path: string): Promise<void>;
  /**
   * note を `newPath` へ移動し、紐づく画像の notePath も追従させる。
   * `updateLastOpened` が true の場合は lastOpenedPath も同時に更新する。
   */
  renameNote(note: Note, newPath: string, updateLastOpened: boolean): Promise<void>;

  /** 画像を追加する。 */
  addImageAssets(assets: ImageAsset[]): Promise<void>;
  /** 指定 note に紐づく画像のうち、参照されていないものを削除する。 */
  pruneImageAssets(notePath: string, referencedAssetIds: string[]): Promise<void>;
}

const LAST_OPENED_PATH = 'lastOpenedPath';

async function pruneUnreferencedAssets(notePath: string, referencedAssetIds: string[]) {
  const referenced = new Set(referencedAssetIds);
  const assets = await db.imageAssets.where('notePath').equals(notePath).toArray();
  const staleIds = assets.filter((asset) => !referenced.has(asset.id)).map((asset) => asset.id);
  if (staleIds.length > 0) {
    await db.imageAssets.bulkDelete(staleIds);
  }
}

export class IndexedDbNotesRepository implements NotesRepository {
  subscribeNotes(listener: (notes: Note[]) => void): Unsubscribe {
    const subscription = liveQuery(() => db.notes.toArray()).subscribe({ next: listener });
    return () => subscription.unsubscribe();
  }

  subscribeImageAssets(listener: (assets: ImageAsset[]) => void): Unsubscribe {
    const subscription = liveQuery(() => db.imageAssets.toArray()).subscribe({ next: listener });
    return () => subscription.unsubscribe();
  }

  getAllNotes(): Promise<Note[]> {
    return db.notes.toArray();
  }

  getAllImageAssets(): Promise<ImageAsset[]> {
    return db.imageAssets.toArray();
  }

  getNote(path: string): Promise<Note | undefined> {
    return db.notes.get(path);
  }

  async getLastOpenedPath(): Promise<string | undefined> {
    const setting = await db.settings.get(LAST_OPENED_PATH);
    return setting?.value;
  }

  async setLastOpenedPath(path: string): Promise<void> {
    await db.settings.put({ key: LAST_OPENED_PATH, value: path });
  }

  async createNote(note: Note): Promise<void> {
    await db.notes.put(note);
  }

  async saveNote(note: Note, referencedAssetIds: string[]): Promise<void> {
    await db.transaction('rw', db.notes, db.imageAssets, async () => {
      await db.notes.put(note);
      await pruneUnreferencedAssets(note.path, referencedAssetIds);
    });
  }

  async deleteNote(path: string): Promise<void> {
    await db.transaction('rw', db.notes, db.imageAssets, async () => {
      await db.notes.delete(path);
      await db.imageAssets.where('notePath').equals(path).delete();
    });
  }

  async renameNote(note: Note, newPath: string, updateLastOpened: boolean): Promise<void> {
    await db.transaction('rw', db.notes, db.settings, db.imageAssets, async () => {
      await db.notes.put({ ...note, path: newPath });
      await db.notes.delete(note.path);
      await db.imageAssets.where('notePath').equals(note.path).modify({ notePath: newPath });
      if (updateLastOpened) {
        await db.settings.put({ key: LAST_OPENED_PATH, value: newPath });
      }
    });
  }

  async addImageAssets(assets: ImageAsset[]): Promise<void> {
    await db.transaction('rw', db.imageAssets, async () => {
      await db.imageAssets.bulkAdd(assets);
    });
  }

  async pruneImageAssets(notePath: string, referencedAssetIds: string[]): Promise<void> {
    await pruneUnreferencedAssets(notePath, referencedAssetIds);
  }
}

/**
 * driver 選択。デフォルトは IndexedDB (本番 / Web / テスト)。`VITE_STORAGE_DRIVER=fs` を
 * 明示した dev サーバーでのみ filesystem driver を使う。本番ビルドにこの env は無いため、
 * Web 配布版の挙動は従来どおり IndexedDB のまま変わらない。
 */
export const notesRepository: NotesRepository =
  import.meta.env.VITE_STORAGE_DRIVER === 'fs'
    ? new FsNotesRepository()
    : new IndexedDbNotesRepository();
