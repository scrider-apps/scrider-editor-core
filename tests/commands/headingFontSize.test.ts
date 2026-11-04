import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import {
  computeFontSizeApplyRanges,
  computeNonHeadingRanges,
} from '../../src/commands/headingFontSize';

function makeMixedDoc(): Delta {
  return new Delta()
    .insert('para')
    .insert('\n')
    .insert('head')
    .insert('\n', { header: 1 })
    .insert('body')
    .insert('\n');
}

describe('computeFontSizeApplyRanges', () => {
  it('expands caret in heading to full line body', () => {
    expect(computeFontSizeApplyRanges(makeMixedDoc(), 7, 0)).toEqual([{ start: 5, length: 4 }]);
  });

  it('expands partial heading selection to full line body', () => {
    expect(computeFontSizeApplyRanges(makeMixedDoc(), 7, 2)).toEqual([{ start: 5, length: 4 }]);
  });

  it('keeps paragraph selection partial', () => {
    expect(computeFontSizeApplyRanges(makeMixedDoc(), 1, 2)).toEqual([{ start: 1, length: 2 }]);
  });

  it('returns heading full line plus body text (no newlines) for mixed selection', () => {
    // sel [4,12): para `\n` + `head` + heading `\n` + `bo` — newlines skipped
    expect(computeFontSizeApplyRanges(makeMixedDoc(), 4, 8)).toEqual([
      { start: 5, length: 4 },
      { start: 10, length: 2 },
    ]);
  });
});

describe('computeNonHeadingRanges', () => {
  it('matches moved implementation for body-only selection', () => {
    expect(computeNonHeadingRanges(makeMixedDoc(), 1, 2)).toEqual([{ start: 1, length: 2 }]);
    expect(computeNonHeadingRanges(makeMixedDoc(), 6, 2)).toEqual([]);
  });
});
