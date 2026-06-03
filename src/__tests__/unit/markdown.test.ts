import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseInline } from '../../markdown';

describe('parseInline', () => {
  it('プレーンテキストをそのまま返す', () => {
    const result = parseInline('hello world', 'k');
    expect(result).toEqual(['hello world']);
  });

  it('バッククォートを code 要素に変換する', () => {
    const result = parseInline('use `npm install`', 'k');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('use ');
  });

  it('**bold** を strong 要素に変換する', () => {
    const result = parseInline('**bold text**', 'k');
    expect(result).toHaveLength(1);
    const el = result[0] as React.ReactElement;
    expect(el.type).toBe('strong');
  });

  it('*italic* を em 要素に変換する', () => {
    const result = parseInline('*italic text*', 'k');
    const el = result[0] as React.ReactElement;
    expect(el.type).toBe('em');
  });

  it('~~strikethrough~~ を del 要素に変換する', () => {
    const result = parseInline('~~del text~~', 'k');
    const el = result[0] as React.ReactElement;
    expect(el.type).toBe('del');
  });

  it('[link](url) を a 要素に変換する', () => {
    const result = parseInline('[example](https://example.com)', 'k');
    const el = result[0] as React.ReactElement;
    expect(el.type).toBe('a');
    expect(el.props.href).toBe('https://example.com');
  });
});

import type React from 'react';

describe('renderMarkdown', () => {
  it('空文字列は空配列を返す', () => {
    expect(renderMarkdown('')).toHaveLength(0);
  });

  it('空行のみは空配列を返す', () => {
    expect(renderMarkdown('\n\n\n')).toHaveLength(0);
  });

  it('# 見出しを h1 要素に変換する', () => {
    const blocks = renderMarkdown('# Hello');
    expect(blocks).toHaveLength(1);
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('h1');
  });

  it('## 見出しを h2 要素に変換する', () => {
    const blocks = renderMarkdown('## Section');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('h2');
  });

  it('段落テキストを p 要素に変換する', () => {
    const blocks = renderMarkdown('これはテキストです');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('p');
  });

  it('--- を hr 要素に変換する', () => {
    const blocks = renderMarkdown('---');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('hr');
  });

  it('> 引用を blockquote 要素に変換する', () => {
    const blocks = renderMarkdown('> 引用テキスト');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('blockquote');
  });

  it('- リストを ul 要素に変換する', () => {
    const blocks = renderMarkdown('- item1\n- item2');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('ul');
  });

  it('1. リストを ol 要素に変換する', () => {
    const blocks = renderMarkdown('1. first\n2. second');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('ol');
  });

  it('```コードブロックを pre > code に変換する', () => {
    const blocks = renderMarkdown('```\nconst x = 1;\n```');
    const el = blocks[0] as React.ReactElement;
    expect(el.type).toBe('pre');
  });

  it('[ ] タスクリストを md-tasklist クラス付きの ul に変換する', () => {
    const blocks = renderMarkdown('- [ ] TODO\n- [x] Done');
    const el = blocks[0] as React.ReactElement;
    expect((el.props as { className: string }).className).toContain('md-tasklist');
  });

  it('複数ブロックを順番に変換する', () => {
    const md = '# Title\n\nParagraph text.\n\n- item';
    const blocks = renderMarkdown(md);
    expect(blocks).toHaveLength(3);
  });
});
