import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { MarkdownPreview } from '../../markdown';

describe('MarkdownPreview', () => {
  it('見出し h1 に md-h md-h1 クラスが付与される', () => {
    const { container } = render(<MarkdownPreview content="# Hello" />);
    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1!.className).toContain('md-h1');
  });

  it('見出し h2 に md-h md-h2 クラスが付与される', () => {
    const { container } = render(<MarkdownPreview content="## Section" />);
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2!.className).toContain('md-h2');
  });

  it('見出し h3/h4 に対応クラスが付与される', () => {
    const { container } = render(<MarkdownPreview content={'### A\n\n#### B'} />);
    expect(container.querySelector('h3')?.className).toContain('md-h3');
    expect(container.querySelector('h4')?.className).toContain('md-h4');
  });

  it('段落を p.md-p に変換する', () => {
    const { container } = render(<MarkdownPreview content="これはテキストです" />);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.className).toContain('md-p');
  });

  it('--- を hr.md-hr に変換する', () => {
    const { container } = render(<MarkdownPreview content="---" />);
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
    expect(hr!.className).toContain('md-hr');
  });

  it('引用を blockquote.md-quote に変換する', () => {
    const { container } = render(<MarkdownPreview content="> 引用テキスト" />);
    const bq = container.querySelector('blockquote');
    expect(bq).not.toBeNull();
    expect(bq!.className).toContain('md-quote');
  });

  it('箇条書きを ul.md-list に変換する', () => {
    const { container } = render(<MarkdownPreview content={'- item1\n- item2'} />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul!.className).toContain('md-list');
  });

  it('番号付きリストを ol.md-list に変換する', () => {
    const { container } = render(<MarkdownPreview content={'1. first\n2. second'} />);
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol!.className).toContain('md-list');
  });

  it('コードブロックを pre.md-pre > code に変換する', () => {
    const { container } = render(<MarkdownPreview content={'```\nconst x = 1;\n```'} />);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.className).toContain('md-pre');
    expect(pre!.querySelector('code')).not.toBeNull();
  });

  it('インラインコードに md-code クラスが付与される', () => {
    const { container } = render(<MarkdownPreview content="Use `npm install`" />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.className).toContain('md-code');
  });

  it('外部リンクに md-link クラスと別タブ用属性が付与される', () => {
    const { container } = render(<MarkdownPreview content="[example](https://example.com)" />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.className).toContain('md-link');
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toBe('noreferrer');
    expect(fireEvent.click(a!)).toBe(true);
  });

  it('絶対 URL 形式のリンクを外部リンクとして扱う', () => {
    const { container } = render(
      <MarkdownPreview content="[mail](mailto:a@example.com)\n[site](//example.com)" />
    );
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noreferrer');
      expect(fireEvent.click(a)).toBe(true);
    }
  });

  it('相対リンクは別タブ化せず遷移も抑止する', () => {
    const { container } = render(<MarkdownPreview content="[other](./other.md)" />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.className).toContain('md-link');
    expect(a!.getAttribute('target')).toBeNull();
    expect(a!.getAttribute('rel')).toBeNull();
    expect(fireEvent.click(a!)).toBe(false);
  });

  it('画像に md-img クラスと Markdown の属性が付与される', () => {
    const { container } = render(
      <MarkdownPreview content="![スクリーンショット](https://example.com/image.png)" />
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.className).toContain('md-img');
    expect(img!.getAttribute('src')).toBe('https://example.com/image.png');
    expect(img!.getAttribute('alt')).toBe('スクリーンショット');
    expect(img!.getAttribute('loading')).toBe('lazy');
  });

  it('タスクリストを ul.md-tasklist に変換する', () => {
    const { container } = render(<MarkdownPreview content={'- [ ] TODO\n- [x] Done'} />);
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul!.className).toContain('md-tasklist');
  });

  it('完了タスクに is-done クラスが付与される', () => {
    const { container } = render(<MarkdownPreview content={'- [ ] TODO\n- [x] Done'} />);
    const items = container.querySelectorAll('li');
    const doneItem = Array.from(items).find((li) => li.className.includes('is-done'));
    expect(doneItem).not.toBeNull();
  });

  it('テーブル構文を table 要素としてレンダリングする', () => {
    const md = '| col1 | col2 |\n| --- | --- |\n| a | b |';
    const { container } = render(<MarkdownPreview content={md} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('th')).not.toBeNull();
    expect(container.querySelector('td')).not.toBeNull();
  });

  it('段落内の単一改行を br 要素として扱う', () => {
    const { container } = render(<MarkdownPreview content={'foo\nbar'} />);
    expect(container.querySelector('br')).not.toBeNull();
  });

  it('コードブロック内の code に md-code クラスが付かない', () => {
    const { container } = render(<MarkdownPreview content={'```\nconst x = 1;\n```'} />);
    const code = container.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code!.className).not.toContain('md-code');
  });

  it('タスクリストに native checkbox が残らない', () => {
    const { container } = render(<MarkdownPreview content={'- [ ] TODO\n- [x] Done'} />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('引用内の段落が p.md-p として出力される', () => {
    const { container } = render(<MarkdownPreview content={'> 引用テキスト'} />);
    const p = container.querySelector('blockquote p');
    expect(p).not.toBeNull();
  });

  it('frontmatter を key-value パネルとして描画し生 YAML を出さない', () => {
    const { container } = render(
      <MarkdownPreview content={'---\ntitle: Hello\nstatus: living\n---\n# 本文\n'} />
    );
    const panel = container.querySelector('.md-frontmatter');
    expect(panel).not.toBeNull();
    const keys = Array.from(panel!.querySelectorAll('.fm-key')).map((el) => el.textContent);
    expect(keys).toEqual(['title', 'status']);
    const values = Array.from(panel!.querySelectorAll('.fm-value')).map((el) => el.textContent);
    expect(values).toEqual(['Hello', 'living']);
    // 生 YAML 由来の hr / 区切り線が view に出ていないこと
    expect(container.querySelector('hr')).toBeNull();
    // 本文 H1 は描画される
    expect(container.querySelector('h1')?.textContent).toBe('本文');
  });

  it('スカラと配列の両方をパネルに描画する', () => {
    const { container } = render(
      <MarkdownPreview content={'---\ntitle: T\naliases:\n  - a\n  - b\n---\nbody'} />
    );
    const items = Array.from(container.querySelectorAll('.fm-list .fm-item')).map(
      (el) => el.textContent
    );
    expect(items).toEqual(['a', 'b']);
    expect(container.querySelector('.fm-key')?.textContent).toBe('title');
  });

  it('frontmatter を持たないノートではパネルを描画しない', () => {
    const { container } = render(<MarkdownPreview content={'# ただの見出し\n\ntext'} />);
    expect(container.querySelector('.md-frontmatter')).toBeNull();
  });

  it('gemoji shortcode を対応する絵文字に変換する', () => {
    const { container } = render(<MarkdownPreview content=":smile: と :rocket:" />);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe('😄 と 🚀');
  });

  it('インラインコード内の shortcode はリテラル表示のまま保つ', () => {
    const { container } = render(<MarkdownPreview content="Use `:smile:`" />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe(':smile:');
  });

  it('コードブロック内の shortcode はリテラル表示のまま保つ', () => {
    const { container } = render(<MarkdownPreview content={'```\n:smile:\n```'} />);
    const code = container.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toContain(':smile:');
  });
});
