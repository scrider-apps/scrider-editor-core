import { describe, expect, it } from 'vitest';

import { postRenderQueryRoot } from '../../src/plugin';

describe('postRenderQueryRoot', () => {
  it('returns scope when provided', () => {
    const container = { tagName: 'DIV' } as unknown as Element;
    const scope = { tagName: 'P' } as unknown as Element;
    expect(postRenderQueryRoot(container, { scope })).toBe(scope);
  });

  it('returns container when scope is omitted', () => {
    const container = { tagName: 'DIV' } as unknown as Element;
    expect(postRenderQueryRoot(container)).toBe(container);
    expect(postRenderQueryRoot(container, {})).toBe(container);
  });
});
