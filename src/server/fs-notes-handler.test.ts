import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFsNotesHandler, expandHome, resolveInNotesDir } from './fs-notes-handler';

import type { IncomingMessage, ServerResponse } from 'node:http';

const NOTES_DIR = path.resolve('/tmp/aze-notes');

describe('resolveInNotesDir', () => {
  it('notes ディレクトリ配下の .md は絶対パスに解決する', () => {
    expect(resolveInNotesDir(NOTES_DIR, 'note.md')).toBe(path.join(NOTES_DIR, 'note.md'));
    expect(resolveInNotesDir(NOTES_DIR, 'sub/dir/note.md')).toBe(
      path.join(NOTES_DIR, 'sub/dir/note.md')
    );
  });

  it('.md 以外は拒否する', () => {
    expect(resolveInNotesDir(NOTES_DIR, 'note.txt')).toBeNull();
    expect(resolveInNotesDir(NOTES_DIR, 'note')).toBeNull();
  });

  it('null / undefined / 空文字は拒否する', () => {
    expect(resolveInNotesDir(NOTES_DIR, null)).toBeNull();
    expect(resolveInNotesDir(NOTES_DIR, undefined)).toBeNull();
    expect(resolveInNotesDir(NOTES_DIR, '')).toBeNull();
  });

  it('notes ディレクトリ外へ逸脱するパスは拒否する', () => {
    expect(resolveInNotesDir(NOTES_DIR, '../escape.md')).toBeNull();
    expect(resolveInNotesDir(NOTES_DIR, '../../etc/passwd.md')).toBeNull();
    expect(resolveInNotesDir(NOTES_DIR, 'sub/../../escape.md')).toBeNull();
  });

  it('notes ディレクトリと同名 prefix の sibling ディレクトリは拒否する', () => {
    // `${NOTES_DIR}-evil/x.md` は文字列としては NOTES_DIR で始まるが別ディレクトリ。
    expect(resolveInNotesDir(NOTES_DIR, '../aze-notes-evil/x.md')).toBeNull();
  });
});

describe('expandHome', () => {
  it('先頭の ~ をホームに展開する', () => {
    expect(expandHome('~')).toBe(os.homedir());
    expect(expandHome('~/notes')).toBe(path.join(os.homedir(), 'notes'));
  });

  it('~ 始まりでないパスはそのまま返す', () => {
    expect(expandHome('/abs/path')).toBe('/abs/path');
    expect(expandHome('relative/path')).toBe('relative/path');
    expect(expandHome('~user/notes')).toBe('~user/notes');
  });
});

interface MockResult {
  status: number;
  json: Record<string, unknown>;
}

/** `/api/notes` mount 後の相対 url を前提に handler を 1 回呼び、結果を取り出す。 */
async function call(
  notesRoot: string,
  method: string,
  url: string,
  body?: unknown
): Promise<MockResult> {
  const handler = createFsNotesHandler({ notesRoot });
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const req = Readable.from(raw ? [raw] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;

  let payload = '';
  const res = {
    statusCode: 0,
    setHeader() {},
    end(chunk?: string) {
      if (chunk) payload += chunk;
    },
  };

  await handler(req, res as unknown as ServerResponse);
  return {
    status: res.statusCode,
    json: payload ? (JSON.parse(payload) as Record<string, unknown>) : {},
  };
}

describe('createFsNotesHandler', () => {
  let notesDir: string;

  beforeEach(() => {
    notesDir = mkdtempSync(path.join(os.tmpdir(), 'aze-handler-'));
    writeFileSync(path.join(notesDir, 'hello.md'), '# Hello\n\nworld\n');
    mkdirSync(path.join(notesDir, 'sub'));
    writeFileSync(path.join(notesDir, 'sub', 'nested.md'), '# Nested\n');
  });

  afterEach(() => {
    rmSync(notesDir, { recursive: true, force: true });
  });

  it('GET / は notes ディレクトリ配下の .md を再帰列挙する', async () => {
    const { status, json } = await call(notesDir, 'GET', '/');
    expect(status).toBe(200);
    const notes = json.notes as Array<{ path: string }>;
    expect(notes.map((n) => n.path).sort()).toEqual(['hello.md', 'sub/nested.md']);
  });

  it('GET /one?path= は note を返す', async () => {
    const { status, json } = await call(notesDir, 'GET', '/one?path=hello.md');
    expect(status).toBe(200);
    expect((json.note as { body: string }).body).toBe('# Hello\n\nworld\n');
  });

  it('GET /one は存在しない path で 404', async () => {
    const { status } = await call(notesDir, 'GET', '/one?path=missing.md');
    expect(status).toBe(404);
  });

  it('PUT /one は作成・上書きする', async () => {
    const create = await call(notesDir, 'PUT', '/one', {
      path: 'new.md',
      created: '',
      updated: '',
      body: '# New\n',
    });
    expect(create.status).toBe(200);
    expect(readFileSync(path.join(notesDir, 'new.md'), 'utf8')).toBe('# New\n');

    const overwrite = await call(notesDir, 'PUT', '/one', {
      path: 'hello.md',
      created: '',
      updated: '',
      body: '# Edited\n',
    });
    expect(overwrite.status).toBe(200);
    expect(readFileSync(path.join(notesDir, 'hello.md'), 'utf8')).toBe('# Edited\n');
  });

  it('POST /rename は note を移動する', async () => {
    const { status } = await call(notesDir, 'POST', '/rename', {
      oldPath: 'hello.md',
      newPath: 'sub/moved.md',
    });
    expect(status).toBe(200);
    expect(existsSync(path.join(notesDir, 'hello.md'))).toBe(false);
    expect(existsSync(path.join(notesDir, 'sub', 'moved.md'))).toBe(true);
  });

  it('DELETE /one は note を削除する', async () => {
    const { status } = await call(notesDir, 'DELETE', '/one?path=hello.md');
    expect(status).toBe(200);
    expect(existsSync(path.join(notesDir, 'hello.md'))).toBe(false);
  });

  it('notes ディレクトリ外への書き込みは 400 で拒否しファイルを作らない', async () => {
    const { status } = await call(notesDir, 'PUT', '/one', {
      path: '../escape.md',
      created: '',
      updated: '',
      body: 'x',
    });
    expect(status).toBe(400);
    expect(existsSync(path.join(notesDir, '..', 'escape.md'))).toBe(false);
  });

  it('不正な JSON body は 500 ではなく 400 を返す', async () => {
    const { status, json } = await call(notesDir, 'PUT', '/one', '{not json');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid body');
  });

  it('path/body が文字列でない PUT は 400', async () => {
    const { status } = await call(notesDir, 'PUT', '/one', { path: 123, body: {} });
    expect(status).toBe(400);
  });

  it('未対応の method/path は 404', async () => {
    const { status } = await call(notesDir, 'GET', '/unknown');
    expect(status).toBe(404);
  });

  it('GET 空パスは GET / と同じく一覧を返す', async () => {
    const { status, json } = await call(notesDir, 'GET', '');
    expect(status).toBe(200);
    const notes = json.notes as Array<{ path: string }>;
    expect(notes.map((n) => n.path).sort()).toEqual(['hello.md', 'sub/nested.md']);
  });

  it('既知 path への未対応 method は 404', async () => {
    expect((await call(notesDir, 'POST', '/one')).status).toBe(404);
    expect((await call(notesDir, 'GET', '/rename')).status).toBe(404);
  });
});
