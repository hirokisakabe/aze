import { describe, it, expect } from 'vitest';

import { getParentFolder, parseNotePath } from './note-path';

describe('getParentFolder', () => {
  it('トップレベルのパスは空文字を返す', () => {
    expect(getParentFolder('inbox.md')).toBe('');
  });

  it('1 階層のパスは親フォルダを末尾スラッシュ付きで返す', () => {
    expect(getParentFolder('daily/2024-06-02.md')).toBe('daily/');
  });

  it('深いパスは直近の親フォルダまでを返す', () => {
    expect(getParentFolder('a/b/c.md')).toBe('a/b/');
  });
});

describe('parseNotePath', () => {
  it('空文字はエラーなしで空パスを返す', () => {
    expect(parseNotePath('')).toEqual({ path: '', error: '' });
    expect(parseNotePath('   ')).toEqual({ path: '', error: '' });
  });

  it('拡張子がなければ .md を補完する', () => {
    expect(parseNotePath('ideas/new-idea')).toEqual({ path: 'ideas/new-idea.md', error: '' });
  });

  it('.md 付きのパスはそのまま採用する', () => {
    expect(parseNotePath('archive/note.md')).toEqual({ path: 'archive/note.md', error: '' });
  });

  it('先頭スラッシュと連続スラッシュを正規化する', () => {
    expect(parseNotePath('/a//b/c')).toEqual({ path: 'a/b/c.md', error: '' });
  });

  it('ファイル名を含まない（スラッシュ終端）パスはエラー', () => {
    const result = parseNotePath('folder/');
    expect(result.path).toBe('');
    expect(result.error).toBe('ファイル名を含むパスを入力してください。');
  });

  it('「.」「..」を含むパスはエラー', () => {
    expect(parseNotePath('a/../b').error).toBe('「.」または「..」を含むパスは使えません。');
    expect(parseNotePath('./note').error).toBe('「.」または「..」を含むパスは使えません。');
  });
});
