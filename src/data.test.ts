import { describe, it, expect } from 'vitest';
import { buildTree, noteTitle, ancestorsOf } from './data';
import type { Note } from './data';

const note = (path: string, body = ''): Note => ({
  path,
  body,
  created: '2024-01-01',
  updated: '2024-01-01',
});

describe('ancestorsOf', () => {
  it('トップレベルファイルは空配列を返す', () => {
    expect(ancestorsOf('inbox.md')).toEqual([]);
  });

  it('1 階層のファイルは親フォルダのパスを返す', () => {
    expect(ancestorsOf('daily/2024-06-02.md')).toEqual(['daily']);
  });

  it('2 階層のファイルは全祖先を返す', () => {
    expect(ancestorsOf('a/b/c.md')).toEqual(['a', 'a/b']);
  });

  it('3 階層の深いパスも正しく処理する', () => {
    expect(ancestorsOf('a/b/c/d.md')).toEqual(['a', 'a/b', 'a/b/c']);
  });
});

describe('noteTitle', () => {
  it('先頭の # 見出しをタイトルとして返す', () => {
    expect(noteTitle(note('foo.md', '# Hello World\n\nContent'))).toBe('Hello World');
  });

  it('見出しがない場合はファイル名（拡張子なし）を返す', () => {
    expect(noteTitle(note('ideas/my-note.md', 'Plain text'))).toBe('my-note');
  });

  it('本文中の見出しは無視して先頭の # を使う', () => {
    expect(noteTitle(note('n.md', 'intro\n# Title\n'))).toBe('Title');
  });

  it('空の本文はファイル名を返す', () => {
    expect(noteTitle(note('empty.md', ''))).toBe('empty');
  });
});

describe('buildTree', () => {
  it('空のノートリストはルートのみのツリーを返す', () => {
    const tree = buildTree([]);
    expect(tree.type).toBe('folder');
    expect(tree.children).toHaveLength(0);
  });

  it('トップレベルノートはルート直下に配置される', () => {
    const tree = buildTree([note('inbox.md'), note('todo.md')]);
    expect(tree.children).toHaveLength(2);
    expect(tree.children?.map((c) => c.name)).toContain('inbox.md');
  });

  it('ファイルノードは先頭の # 見出しを表示タイトルとして保持する', () => {
    const tree = buildTree([note('inbox.md', '# Inbox Title\n\nBody')]);
    expect(tree.children?.[0].name).toBe('inbox.md');
    expect(tree.children?.[0].title).toBe('Inbox Title');
  });

  it('見出しがないファイルノードはファイル名由来の表示タイトルを保持する', () => {
    const tree = buildTree([note('plain-note.md', 'Plain text')]);
    expect(tree.children?.[0].name).toBe('plain-note.md');
    expect(tree.children?.[0].title).toBe('plain-note');
  });

  it('サブフォルダのノートはフォルダ階層に配置される', () => {
    const tree = buildTree([note('daily/2024-06-02.md')]);
    const daily = tree.children?.find((c) => c.name === 'daily');
    expect(daily?.type).toBe('folder');
    expect(daily?.children).toHaveLength(1);
    expect(daily?.children?.[0].name).toBe('2024-06-02.md');
  });

  it('深い階層のノートも正しくツリーに配置される', () => {
    const tree = buildTree([note('a/b/c.md')]);
    const a = tree.children?.find((c) => c.name === 'a');
    const b = a?.children?.find((c) => c.name === 'b');
    const c = b?.children?.find((c) => c.name === 'c.md');
    expect(c?.type).toBe('file');
  });

  it('フォルダがファイルより先にソートされる', () => {
    const tree = buildTree([note('readme.md'), note('docs/intro.md')]);
    expect(tree.children?.[0].type).toBe('folder');
    expect(tree.children?.[1].type).toBe('file');
  });

  it('同じフォルダのノートは共通の親フォルダを共有する', () => {
    const tree = buildTree([note('reading/a.md'), note('reading/b.md')]);
    const reading = tree.children?.find((c) => c.name === 'reading');
    expect(reading?.children).toHaveLength(2);
  });
});
