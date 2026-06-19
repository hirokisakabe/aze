import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNotesWatcher, type NotesWatcher } from '../../server/notes-watcher';

// fs.watch の発火はプラットフォーム / タイミング依存なので、debounce は短く、待ちは緩めにする。
const DEBOUNCE_MS = 10;
const WAIT_TIMEOUT = 3000;

describe('createNotesWatcher', () => {
  let notesDir: string;
  let watcher: NotesWatcher | null;

  beforeEach(() => {
    notesDir = mkdtempSync(path.join(os.tmpdir(), 'aze-watch-'));
    writeFileSync(path.join(notesDir, 'hello.md'), '# Hello\n');
    mkdirSync(path.join(notesDir, 'sub'));
    writeFileSync(path.join(notesDir, 'sub', 'nested.md'), '# Nested\n');
    watcher = null;
  });

  afterEach(() => {
    watcher?.close();
    watcher = null;
    rmSync(notesDir, { recursive: true, force: true });
  });

  /** onChange が呼ばれるまで待つ。fs イベントの取りこぼしに備え操作を繰り返し試みる。 */
  function waitForChange(fire: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        clearInterval(retry);
        reject(new Error('onChange was not called within timeout'));
      }, WAIT_TIMEOUT);
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(retry);
        resolve();
      };
      watcher = createNotesWatcher(notesDir, { debounceMs: DEBOUNCE_MS });
      const unsubscribe = watcher.subscribe(() => {
        unsubscribe();
        finish();
      });
      // 初期 reconcile (watcher 構築) 完了前の操作は拾えないため、発火を周期的に再試行する。
      const retry = setInterval(fire, 100);
      fire();
    });
  }

  it('既存 .md の編集を通知する', async () => {
    await waitForChange(() =>
      writeFileSync(path.join(notesDir, 'hello.md'), `# Edited ${Date.now()}\n`)
    );
  });

  it('新規 .md の作成を通知する', async () => {
    let i = 0;
    await waitForChange(() => writeFileSync(path.join(notesDir, `created-${i++}.md`), '# New\n'));
  });

  it('.md の削除を通知する', async () => {
    // 削除は 1 度しか試せないので、別ファイルを毎回作っては消すことで再試行可能にする。
    let i = 0;
    await waitForChange(() => {
      const p = path.join(notesDir, `tmp-${i++}.md`);
      writeFileSync(p, 'x');
      rmSync(p, { force: true });
    });
  });

  it('サブディレクトリ内の編集を通知する', async () => {
    await waitForChange(() =>
      writeFileSync(path.join(notesDir, 'sub', 'nested.md'), `# Edited ${Date.now()}\n`)
    );
  });

  it('新規サブディレクトリの作成を通知する', async () => {
    let i = 0;
    await waitForChange(() => {
      const dir = path.join(notesDir, `newdir-${i++}`);
      mkdirSync(dir);
      writeFileSync(path.join(dir, 'note.md'), '# In new dir\n');
    });
  });

  it('リネームを通知する', async () => {
    let i = 0;
    await waitForChange(() => {
      const from = path.join(notesDir, `rename-src-${i}.md`);
      writeFileSync(from, 'x');
      renameSync(from, path.join(notesDir, `rename-dst-${i++}.md`));
    });
  });

  it('close 後は通知しない', async () => {
    watcher = createNotesWatcher(notesDir, { debounceMs: DEBOUNCE_MS });
    let calls = 0;
    watcher.subscribe(() => {
      calls += 1;
    });
    // 初期 watcher 構築を待ってから close する。
    await new Promise((r) => setTimeout(r, 200));
    watcher.close();
    const before = calls;
    writeFileSync(path.join(notesDir, 'after-close.md'), '# x\n');
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBe(before);
  });

  it('unsubscribe した listener には通知しない', async () => {
    watcher = createNotesWatcher(notesDir, { debounceMs: DEBOUNCE_MS });
    let calls = 0;
    const unsubscribe = watcher.subscribe(() => {
      calls += 1;
    });
    await new Promise((r) => setTimeout(r, 200));
    unsubscribe();
    const before = calls;
    writeFileSync(path.join(notesDir, 'after-unsub.md'), '# x\n');
    await new Promise((r) => setTimeout(r, 300));
    expect(calls).toBe(before);
  });

  it('削除されたサブディレクトリの watcher は解放される (再生成しても通知が壊れない)', async () => {
    // reconcile による watcher 集合の追従を間接的に確認する。
    watcher = createNotesWatcher(notesDir, { debounceMs: DEBOUNCE_MS });
    await new Promise((r) => setTimeout(r, 200));
    rmSync(path.join(notesDir, 'sub'), { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 200));
    // sub 削除後でも root の変更は引き続き通知される。
    await waitForChangeOn(watcher, () =>
      writeFileSync(path.join(notesDir, 'after-rmdir.md'), `# ${Date.now()}\n`)
    );
  });
});

/** 指定 watcher に subscribe し、onChange を待つヘルパ (既存 watcher を再利用するケース用)。 */
function waitForChangeOn(watcher: NotesWatcher, fire: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      clearInterval(retry);
      unsubscribe();
      reject(new Error('onChange was not called within timeout'));
    }, WAIT_TIMEOUT);
    const unsubscribe = watcher.subscribe(() => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(retry);
      unsubscribe();
      resolve();
    });
    const retry = setInterval(fire, 100);
    fire();
  });
}
