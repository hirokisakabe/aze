import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandHome, resolveInVault } from '../../server/fs-notes-handler';

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
