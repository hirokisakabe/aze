import { watch, type FSWatcher } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * vault root 配下を再帰的に watch し、.md の変更 (作成 / 編集 / 削除 / リネーム) を
 * debounce して購読者へ通知する (issue #87)。
 *
 * 実装メモ:
 * - Node の `fs.watch(dir, { recursive: true })` は Linux で不安定 (nodejs/node#48437) なため、
 *   ディレクトリごとに非 recursive な `fs.watch` を張り、サブディレクトリの増減に追従する
 *   自前実装にしている。全プラットフォームで安定して動く非 recursive watch のみを使う。
 * - 通知は「何かが変わった」というシグナルのみで、ファイル単位の差分は持たない。購読側
 *   (FsNotesRepository) が通知のたびに full re-list するため、個々のイベント欠落 / 重複に強い。
 *   内容変更 (change) は .md のみ通知し、構造変化 (rename: 作成 / 削除 / リネーム) は
 *   ディレクトリ増減も拾うため絞らずに通知する。
 * - dotfile / node_modules は listMarkdown (fs-notes-handler) と同じ基準で watch 対象外にする。
 */

// fs-notes-handler.ts の listMarkdown と watch 対象を揃える。
const IGNORED_DIRS = new Set(['node_modules']);
const DEFAULT_DEBOUNCE_MS = 150;

export interface VaultWatcher {
  /** 変更通知を購読する。返り値で解除する。 */
  subscribe(onChange: () => void): () => void;
  /** すべての watcher / timer を解放する。以降は通知しない。 */
  close(): void;
}

export function createVaultWatcher(
  vaultRoot: string,
  options: { debounceMs?: number } = {}
): VaultWatcher {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const listeners = new Set<() => void>();
  const watchers = new Map<string, FSWatcher>();
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const scheduleNotify = (): void => {
    if (closed) return;
    if (notifyTimer) clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      for (const listener of [...listeners]) listener();
    }, debounceMs);
  };

  const scheduleReconcile = (): void => {
    if (closed || reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      void reconcile();
    }, debounceMs);
  };

  const addWatcher = (dir: string): void => {
    if (closed || watchers.has(dir)) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(dir, (eventType, filename) => {
        if (eventType === 'rename') {
          // rename は entry の作成 / 削除 / リネーム (= ディレクトリ構造の変化) を含む。
          // watcher 集合をツリーに追従させたうえで通知する。.md / サブディレクトリの増減を
          // 取りこぼさないため、ここでは filename で絞らない (新規ディレクトリ作成等も拾う)。
          scheduleReconcile();
          scheduleNotify();
          return;
        }
        // change は内容変更。notes 一覧に効くのは .md の内容だけなので、それ以外 (画像等) は
        // 無視して無駄な full re-list を抑える。
        if (typeof filename === 'string' && filename.endsWith('.md')) scheduleNotify();
      });
    } catch {
      // 列挙直後に削除される等で watch に失敗しても、次の reconcile で整合が取れるため無視する。
      return;
    }
    watcher.on('error', () => {
      watcher.close();
      watchers.delete(dir);
    });
    watchers.set(dir, watcher);
  };

  const collectDirs = async (dir: string, acc: Set<string>): Promise<void> => {
    acc.add(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      await collectDirs(path.join(dir, entry.name), acc);
    }
  };

  const reconcile = async (): Promise<void> => {
    if (closed) return;
    const want = new Set<string>();
    await collectDirs(vaultRoot, want);
    if (closed) return;
    for (const dir of want) {
      if (!watchers.has(dir)) addWatcher(dir);
    }
    for (const dir of [...watchers.keys()]) {
      if (!want.has(dir)) {
        watchers.get(dir)?.close();
        watchers.delete(dir);
      }
    }
  };

  // 初期 watcher 構築。完了前に発生したイベントは取りこぼし得るが、購読側の初回 full-list で吸収される。
  void reconcile();

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    close() {
      closed = true;
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        notifyTimer = null;
      }
      if (reconcileTimer) {
        clearTimeout(reconcileTimer);
        reconcileTimer = null;
      }
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      listeners.clear();
    },
  };
}
