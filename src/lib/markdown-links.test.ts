import { describe, expect, it } from 'vitest';

import { resolveMarkdownNoteLink, resolveRelativeMarkdownNotePath } from './markdown-links';

describe('resolveRelativeMarkdownNotePath', () => {
  it('現在ノートから ./ と ../ の Markdown 相対リンクを正規化する', () => {
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './other.md')).toBe(
      'folder/other.md'
    );
    expect(resolveRelativeMarkdownNotePath('folder/current.md', '../other.md')).toBe('other.md');
    expect(resolveRelativeMarkdownNotePath('folder/current.md', '../notes/other.md')).toBe(
      'notes/other.md'
    );
  });

  it('外部 URL、絶対パス、Markdown 以外の相対リンクは内部ノートリンクにしない', () => {
    expect(resolveRelativeMarkdownNotePath('current.md', 'https://example.com')).toBeNull();
    expect(resolveRelativeMarkdownNotePath('current.md', 'mailto:a@example.com')).toBeNull();
    expect(resolveRelativeMarkdownNotePath('current.md', '//example.com/page.md')).toBeNull();
    expect(resolveRelativeMarkdownNotePath('current.md', '/other.md')).toBeNull();
    expect(resolveRelativeMarkdownNotePath('current.md', './image.png')).toBeNull();
  });

  it('notes ディレクトリの外へ出るリンクは解決しない', () => {
    expect(resolveRelativeMarkdownNotePath('current.md', '../outside.md')).toBeNull();
  });

  it('hash や query はノート path の解決対象から外す', () => {
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './other.md#heading')).toBe(
      'folder/other.md'
    );
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './other.md?view=1')).toBe(
      'folder/other.md'
    );
  });

  it('URL エンコードされた path segment をノート path に戻す', () => {
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './My%20Note.md')).toBe(
      'folder/My Note.md'
    );
    expect(
      resolveRelativeMarkdownNotePath('folder/current.md', './%E6%97%A5%E6%9C%AC%E8%AA%9E.md')
    ).toBe('folder/日本語.md');
  });

  it('不正な URL エンコードや slash を含む encoded segment は解決しない', () => {
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './bad%zz.md')).toBeNull();
    expect(resolveRelativeMarkdownNotePath('folder/current.md', './nested%2Fnote.md')).toBeNull();
  });
});

describe('resolveMarkdownNoteLink', () => {
  it('存在するノートと存在しないノートを区別する', () => {
    const paths = new Set(['folder/other.md']);

    expect(resolveMarkdownNoteLink('folder/current.md', './other.md', paths)).toEqual({
      status: 'resolved',
      path: 'folder/other.md',
    });
    expect(resolveMarkdownNoteLink('folder/current.md', './missing.md', paths)).toEqual({
      status: 'missing',
      path: 'folder/missing.md',
    });
  });
});
