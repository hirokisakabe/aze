import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isCliEntry,
  parseServeArgs,
  serve,
  serverErrorMessage,
  stripApiPrefix,
  validateNotesDir,
  validateSpaBuilt,
} from './aze';

/** process.exit を捕捉するための番兵エラー。終了コードを保持する。 */
class ExitError extends Error {
  constructor(public readonly code: number | undefined) {
    super(`process.exit(${code})`);
    this.name = 'ExitError';
  }
}

/** process.exit / console.error / console.log をスタブし、終了挙動と出力を検証可能にする。 */
function stubProcess() {
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code);
  }) as never);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { exit, error, log };
}

describe('parseServeArgs', () => {
  let spies: ReturnType<typeof stubProcess>;

  beforeEach(() => {
    spies = stubProcess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('notesDir のみ指定するとデフォルトポートで解釈する', () => {
    expect(parseServeArgs(['notes'])).toEqual({ notesDir: 'notes', port: 4321 });
  });

  it('--port でポートを解釈する', () => {
    expect(parseServeArgs(['notes', '--port', '8080'])).toEqual({
      notesDir: 'notes',
      port: 8080,
    });
  });

  it('-p でポートを解釈する', () => {
    expect(parseServeArgs(['notes', '-p', '8080'])).toEqual({ notesDir: 'notes', port: 8080 });
  });

  it('--port= でポートを解釈する', () => {
    expect(parseServeArgs(['notes', '--port=8080'])).toEqual({ notesDir: 'notes', port: 8080 });
  });

  it('フラグと notesDir の順序は問わない', () => {
    expect(parseServeArgs(['--port', '8080', 'notes'])).toEqual({
      notesDir: 'notes',
      port: 8080,
    });
  });

  it('不明な引数でエラー終了する', () => {
    expect(() => parseServeArgs(['notes', '--bogus'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
    expect(spies.error).toHaveBeenCalledWith(expect.stringContaining('unknown argument'));
  });

  it('2 つ目の位置引数も不明な引数として弾く', () => {
    expect(() => parseServeArgs(['notes', 'extra'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
  });

  it('notesDir 未指定でエラー終了する', () => {
    expect(() => parseServeArgs([])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
    expect(spies.error).toHaveBeenCalledWith(expect.stringContaining('<notes-dir> is required'));
  });

  it('フラグのみで notesDir が無い場合もエラー終了する', () => {
    expect(() => parseServeArgs(['--port', '8080'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
  });

  it('ポート範囲外を弾く', () => {
    expect(() => parseServeArgs(['notes', '--port', '70000'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
    expect(spies.error).toHaveBeenCalledWith(expect.stringContaining('invalid --port'));
  });

  it('負のポートを弾く', () => {
    expect(() => parseServeArgs(['notes', '--port', '-1'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
  });

  it('非整数のポートを弾く', () => {
    expect(() => parseServeArgs(['notes', '--port', 'abc'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
  });

  it('小数のポートを弾く', () => {
    expect(() => parseServeArgs(['notes', '--port', '12.5'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
  });

  it('--help でヘルプを表示し正常終了する', () => {
    expect(() => parseServeArgs(['--help'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(0);
    expect(spies.log).toHaveBeenCalledWith(expect.stringContaining('aze serve'));
  });

  it('-h でヘルプを表示し正常終了する', () => {
    expect(() => parseServeArgs(['-h'])).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(0);
    expect(spies.log).toHaveBeenCalledWith(expect.stringContaining('aze serve'));
  });
});

describe('stripApiPrefix', () => {
  it('プレフィックスのみは "/" に整形する', () => {
    expect(stripApiPrefix('/api/notes')).toBe('/');
  });

  it('末尾スラッシュは "/" に整形する', () => {
    expect(stripApiPrefix('/api/notes/')).toBe('/');
  });

  it('サブパスは相対パスへ整形する', () => {
    expect(stripApiPrefix('/api/notes/one')).toBe('/one');
    expect(stripApiPrefix('/api/notes/one?path=hello.md')).toBe('/one?path=hello.md');
    expect(stripApiPrefix('/api/notes/events')).toBe('/events');
  });

  it('プレフィックス直後のクエリは先頭スラッシュを補う', () => {
    expect(stripApiPrefix('/api/notes?path=hello.md')).toBe('/?path=hello.md');
  });
});

describe('serverErrorMessage', () => {
  it('EADDRINUSE はポート使用中メッセージにする', () => {
    const err: NodeJS.ErrnoException = Object.assign(new Error('addr in use'), {
      code: 'EADDRINUSE',
    });
    expect(serverErrorMessage(err, '127.0.0.1', 4321)).toBe('aze: port 4321 is already in use');
  });

  it('EACCES は権限不足メッセージにする', () => {
    const err: NodeJS.ErrnoException = Object.assign(new Error('denied'), { code: 'EACCES' });
    expect(serverErrorMessage(err, '127.0.0.1', 80)).toBe(
      'aze: permission denied to bind 127.0.0.1:80'
    );
  });

  it('その他のエラーは汎用メッセージにフォールバックする', () => {
    const err: NodeJS.ErrnoException = Object.assign(new Error('boom'), { code: 'EOTHER' });
    expect(serverErrorMessage(err, '127.0.0.1', 4321)).toBe('aze: server error: boom');
  });
});

describe('validateNotesDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'aze-cli-notes-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('実在するディレクトリは null を返す', () => {
    expect(validateNotesDir(dir)).toBeNull();
  });

  it('存在しないパスはエラーメッセージを返す', () => {
    const message = validateNotesDir(path.join(dir, 'missing'));
    expect(message).toContain('notes directory not found or not a directory');
  });

  it('ディレクトリでない (ファイル) パスはエラーメッセージを返す', () => {
    const file = path.join(dir, 'note.md');
    writeFileSync(file, '# hi\n');
    const message = validateNotesDir(file);
    expect(message).toContain('notes directory not found or not a directory');
  });
});

describe('validateSpaBuilt', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'aze-cli-spa-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('index.html があれば null を返す', () => {
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
    expect(validateSpaBuilt(dir)).toBeNull();
  });

  it('index.html が無ければ未ビルドメッセージを返す', () => {
    const message = validateSpaBuilt(dir);
    expect(message).toContain('SPA assets not found');
  });
});

describe('serve', () => {
  let spies: ReturnType<typeof stubProcess>;
  let dir: string;

  beforeEach(() => {
    spies = stubProcess();
    dir = mkdtempSync(path.join(os.tmpdir(), 'aze-cli-serve-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('notes ディレクトリ不在ならエラー出力して終了する', () => {
    // dir 自体は実在するが、その配下の missing は存在しない (一意で衝突しない)。
    const missing = path.join(dir, 'missing');
    expect(() => serve({ notesDir: missing, port: 4321 })).toThrow(ExitError);
    expect(spies.exit).toHaveBeenCalledWith(1);
    expect(spies.error).toHaveBeenCalledWith(
      expect.stringContaining('notes directory not found or not a directory')
    );
  });
});

describe('isCliEntry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'aze-cli-entry-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('entryPath が未指定なら false', () => {
    expect(isCliEntry(undefined, 'file:///whatever.js')).toBe(false);
  });

  it('entryPath の URL が moduleUrl と一致すれば true', () => {
    const file = path.join(dir, 'aze.js');
    writeFileSync(file, '');
    // tmpdir 自体が symlink (macOS の /var→/private/var 等) の場合に備え realpath で正規化する。
    const moduleUrl = pathToFileURL(realpathSync(file)).href;
    expect(isCliEntry(file, moduleUrl)).toBe(true);
  });

  it('symlink 経由の entryPath でも realpath 正規化して一致させる (npm bin 相当)', () => {
    const real = path.join(dir, 'aze.js');
    writeFileSync(real, '');
    const link = path.join(dir, 'aze-link.js');
    symlinkSync(real, link);
    // moduleUrl は実体ファイルの URL。argv[1] が symlink でも true になること。
    const moduleUrl = pathToFileURL(realpathSync(real)).href;
    expect(isCliEntry(link, moduleUrl)).toBe(true);
  });

  it('moduleUrl と異なるファイルなら false', () => {
    const file = path.join(dir, 'aze.js');
    writeFileSync(file, '');
    expect(isCliEntry(file, 'file:///other/module.js')).toBe(false);
  });

  it('存在しない entryPath は realpath 解決に失敗し false', () => {
    expect(isCliEntry(path.join(dir, 'missing.js'), 'file:///whatever.js')).toBe(false);
  });
});
