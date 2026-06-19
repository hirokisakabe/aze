import { describe, it, expect } from 'vitest';

import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('frontmatter が無い本文はそのまま返す', () => {
    const content = '# Title\n\nbody text';
    const result = parseFrontmatter(content);
    expect(result.raw).toBeNull();
    expect(result.body).toBe(content);
    expect(result.entries).toEqual([]);
  });

  it('スカラ値をキー順に key:value として抽出する', () => {
    const content = '---\ntitle: Hello\nstatus: living\nupdated: 2026-06-19\n---\n# H1\n';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([
      { key: 'title', value: 'Hello' },
      { key: 'status', value: 'living' },
      { key: 'updated', value: '2026-06-19' },
    ]);
    expect(result.body).toBe('# H1\n');
  });

  it('ブロックシーケンスを配列値として抽出する', () => {
    const content = '---\naliases:\n  - foo\n  - bar\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'aliases', value: ['foo', 'bar'] }]);
  });

  it('フロー記法の配列を抽出する', () => {
    const content = '---\ntags: [a, b, c]\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'tags', value: ['a', 'b', 'c'] }]);
  });

  it('引用符付きスカラの引用符を除去する', () => {
    const content = '---\ntitle: "Quoted Value"\nname: \'single\'\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([
      { key: 'title', value: 'Quoted Value' },
      { key: 'name', value: 'single' },
    ]);
  });

  it('特定キーを特別扱いせず未知キーも同様に抽出する', () => {
    const content = '---\nfoo: 1\nbar_baz: anything\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([
      { key: 'foo', value: '1' },
      { key: 'bar_baz', value: 'anything' },
    ]);
  });

  it('frontmatter を除去した body を返す', () => {
    const content = '---\ntitle: X\n---\n# Heading\n\ntext';
    const result = parseFrontmatter(content);
    expect(result.body).toBe('# Heading\n\ntext');
  });

  it('単独の --- は frontmatter として扱わない', () => {
    const content = '---';
    const result = parseFrontmatter(content);
    expect(result.raw).toBeNull();
    expect(result.body).toBe(content);
  });

  it('本文途中の --- は frontmatter として扱わない', () => {
    const content = 'intro\n---\ntitle: X\n---\n';
    const result = parseFrontmatter(content);
    expect(result.raw).toBeNull();
    expect(result.body).toBe(content);
  });

  it('raw と body を結合すると元の content に戻る (ロスレス round-trip)', () => {
    const content =
      '---\ntitle: Keep Order\nstatus: living\naliases:\n  - a\n  - b\n---\n# Body\n\ntext';
    const result = parseFrontmatter(content);
    expect(result.raw).not.toBeNull();
    expect((result.raw ?? '') + result.body).toBe(content);
  });

  it('CRLF 改行でも frontmatter を検出しロスレスに分割する', () => {
    const content = '---\r\ntitle: X\r\n---\r\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'title', value: 'X' }]);
    expect((result.raw ?? '') + result.body).toBe(content);
  });

  it('値の中や行末に --- を含んでも閉じフェンスを誤検出しない', () => {
    const content = '---\ntitle: a --- b\nnote: ends ---\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([
      { key: 'title', value: 'a --- b' },
      { key: 'note', value: 'ends ---' },
    ]);
    expect(result.body).toBe('body');
  });

  it('引用符内のカンマを含むフロー配列を壊さない', () => {
    const content = '---\ntags: ["x,y", z]\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'tags', value: ['x,y', 'z'] }]);
  });

  it('ネストした mapping を生テキストとして保持する', () => {
    const content = '---\nmeta:\n  foo: bar\n  baz: qux\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'meta', value: 'foo: bar\nbaz: qux' }]);
  });

  it('ブロックスカラを生テキストとして保持する', () => {
    const content = '---\ndesc: |\n  line1\n  line2\n---\nbody';
    const result = parseFrontmatter(content);
    expect(result.entries).toEqual([{ key: 'desc', value: 'line1\nline2' }]);
  });
});
