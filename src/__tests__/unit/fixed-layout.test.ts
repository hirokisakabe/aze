import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

describe('fixed layout defaults', () => {
  it('旧 Tweaks のデフォルト見た目を CSS の固定値として持つ', () => {
    expect(css).toContain('--measure: 1200px;');
    expect(css).toContain('--body-size: 17px;');
    expect(css).toContain('--accent: #5b6b86;');
    expect(css).toContain('--row-h: 24px;');
    expect(css).toContain('--row-fs: 12.5px;');
    expect(css).toContain('--ink: #1f2024;');
    expect(css).toContain('--panel: #f3f4f6;');
    expect(css).toContain('--gutter: #e8eaee;');
  });

  it('不要になった vibe と sidebar variant の CSS 分岐を持たない', () => {
    expect(css).not.toMatch(/\.vibe-/);
    expect(css).not.toMatch(/\.sb-variant-/);
    expect(css).not.toContain('.sb-filemark');
  });
});
