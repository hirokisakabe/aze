import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Breadcrumb } from './breadcrumb';

describe('Breadcrumb', () => {
  it('.md 拡張子を除いたパスを / 区切りのセグメントで表示する', () => {
    const { container } = render(<Breadcrumb path="ideas/sub/note.md" />);
    const segs = Array.from(container.querySelectorAll('.crumb-seg')).map((s) => s.textContent);
    expect(segs).toEqual(['ideas', '/sub', '/note']);
  });

  it('末尾セグメントに crumb-leaf クラスを付与する', () => {
    const { container } = render(<Breadcrumb path="a/b.md" />);
    const leaf = container.querySelector('.crumb-leaf');
    expect(leaf?.textContent).toBe('b');
  });

  it('トップレベルのパスは単一セグメントとして表示する', () => {
    const { container } = render(<Breadcrumb path="inbox.md" />);
    const segs = container.querySelectorAll('.crumb-seg');
    expect(segs).toHaveLength(1);
    expect(segs[0].textContent).toBe('inbox');
  });
});
