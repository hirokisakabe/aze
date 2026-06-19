import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsNotesHandler, expandHome, resolveInVault } from '../../server/fs-notes-handler';

const VAULT = path.resolve('/tmp/aze-vault');

describe('resolveInVault', () => {
  it('vault 配下の .md は絶対パスに解決する', () => {
    expect(resolveInVault(VAULT, 'note.md')).toBe(path.join(VAULT, 'note.md'));
    expect(resolveInVault(VAULT, 'sub/dir/note.md')).toBe(path.join(VAULT, 'sub/dir/note.md'));
  });

  it('.md 以外は拒否する', () => {
    expect(resolveInVault(VAULT, 'note.txt')).toBeNull();
    expect(resolveInVault(VAULT, 'note')).toBeNull();
  });

  it('null / undefined / 空文字は拒否する', () => {
    expect(resolveInVault(VAULT, null)).toBeNull();
    expect(resolveInVault(VAULT, undefined)).toBeNull();
    expect(resolveInVault(VAULT, '')).toBeNull();
  });

  it('vault 外へ逸脱するパスは拒否する', () => {
    expect(resolveInVault(VAULT, '../escape.md')).toBeNull();
    expect(resolveInVault(VAULT, '../../etc/passwd.md')).toBeNull();
    expect(resolveInVault(VAULT, 'sub/../../escape.md')).toBeNull();
  });

  it('vault と同名 prefix の sibling ディレクトリは拒否する', () => {
    // `${VAULT}-evil/x.md` は文字列としては VAULT で始まるが別ディレクトリ。
    expect(resolveInVault(VAULT, '../aze-vault-evil/x.md')).toBeNull();
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
  vaultRoot: string,
  method: string,
  url: string,
  body?: unknown
): Promise<MockResult> {
  const handler = createFsNotesHandler({ vaultRoot });
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
  let vault: string;

  beforeEach(() => {
    vault = mkdtempSync(path.join(os.tmpdir(), 'aze-handler-'));
    writeFileSync(path.join(vault, 'hello.md'), '# Hello\n\nworld\n');
    mkdirSync(path.join(vault, 'sub'));
    writeFileSync(path.join(vault, 'sub', 'nested.md'), '# Nested\n');
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  it('GET / は vault 配下の .md を再帰列挙する', async () => {
    const { status, json } = await call(vault, 'GET', '/');
    expect(status).toBe(200);
    const notes = json.notes as Array<{ path: string }>;
    expect(notes.map((n) => n.path).sort()).toEqual(['hello.md', 'sub/nested.md']);
  });

  it('GET /one?path= は note を返す', async () => {
    const { status, json } = await call(vault, 'GET', '/one?path=hello.md');
    expect(status).toBe(200);
    expect((json.note as { body: string }).body).toBe('# Hello\n\nworld\n');
  });

  it('GET /one は存在しない path で 404', async () => {
    const { status } = await call(vault, 'GET', '/one?path=missing.md');
    expect(status).toBe(404);
  });

  it('PUT /one は作成・上書きする', async () => {
    const create = await call(vault, 'PUT', '/one', {
      path: 'new.md',
      created: '',
      updated: '',
      body: '# New\n',
    });
    expect(create.status).toBe(200);
    expect(readFileSync(path.join(vault, 'new.md'), 'utf8')).toBe('# New\n');

    const overwrite = await call(vault, 'PUT', '/one', {
      path: 'hello.md',
      created: '',
      updated: '',
      body: '# Edited\n',
    });
    expect(overwrite.status).toBe(200);
    expect(readFileSync(path.join(vault, 'hello.md'), 'utf8')).toBe('# Edited\n');
  });

  it('POST /rename は note を移動する', async () => {
    const { status } = await call(vault, 'POST', '/rename', {
      oldPath: 'hello.md',
      newPath: 'sub/moved.md',
    });
    expect(status).toBe(200);
    expect(existsSync(path.join(vault, 'hello.md'))).toBe(false);
    expect(existsSync(path.join(vault, 'sub', 'moved.md'))).toBe(true);
  });

  it('DELETE /one は note を削除する', async () => {
    const { status } = await call(vault, 'DELETE', '/one?path=hello.md');
    expect(status).toBe(200);
    expect(existsSync(path.join(vault, 'hello.md'))).toBe(false);
  });

  it('vault 外への書き込みは 400 で拒否しファイルを作らない', async () => {
    const { status } = await call(vault, 'PUT', '/one', {
      path: '../escape.md',
      created: '',
      updated: '',
      body: 'x',
    });
    expect(status).toBe(400);
    expect(existsSync(path.join(vault, '..', 'escape.md'))).toBe(false);
  });

  it('不正な JSON body は 500 ではなく 400 を返す', async () => {
    const { status, json } = await call(vault, 'PUT', '/one', '{not json');
    expect(status).toBe(400);
    expect(json.error).toBe('invalid body');
  });

  it('path/body が文字列でない PUT は 400', async () => {
    const { status } = await call(vault, 'PUT', '/one', { path: 123, body: {} });
    expect(status).toBe(400);
  });

  it('未対応の method/path は 404', async () => {
    const { status } = await call(vault, 'GET', '/unknown');
    expect(status).toBe(404);
  });
});
