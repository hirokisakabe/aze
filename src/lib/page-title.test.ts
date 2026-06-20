import { describe, expect, it } from 'vitest';

import { formatPageTitle } from './page-title';

describe('formatPageTitle', () => {
  it('mountPath があればタイトルに含める', () => {
    expect(formatPageTitle('/Users/example/notes')).toBe('aze - /Users/example/notes');
  });

  it('mountPath がなければ通常タイトルを返す', () => {
    expect(formatPageTitle()).toBe('aze');
  });
});
