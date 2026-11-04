import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { SCRIDER_LINE_HEIGHT_KEY } from '../../src/commands/settingsLineSpacing';
import {
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
} from '../../src/commands/settingsParagraphSpacing';
import {
  describeLineSpacingPending,
  describeParagraphSpacingPending,
} from '../../src/commands/settingsPreviewPending';

describe('describeLineSpacingPending', () => {
  it('returns mismatch details when line height differs', () => {
    const delta = new Delta().insert('Body\n');
    const reason = describeLineSpacingPending(delta, 1.5);
    expect(reason?.id).toBe('line-spacing');
    expect(reason?.mismatches[0]).toMatchObject({
      attribute: SCRIDER_LINE_HEIGHT_KEY,
      current: '(missing)',
      expected: '1.5',
    });
  });

  it('returns null when delta matches', () => {
    const delta = new Delta().insert('Body').insert('\n', { [SCRIDER_LINE_HEIGHT_KEY]: '1.5' });
    expect(describeLineSpacingPending(delta, 1.5)).toBeNull();
  });
});

describe('describeParagraphSpacingPending', () => {
  it('does not report missing margin-before when settings before is zero', () => {
    const delta = new Delta().insert('Body').insert('\n', { [SCRIDER_MARGIN_AFTER_KEY]: '0.5em' });
    expect(describeParagraphSpacingPending(delta, 0.5, 0)).toBeNull();
  });

  it('returns null when before and after match settings', () => {
    const delta = new Delta().insert('Body').insert('\n', {
      [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
      [SCRIDER_MARGIN_BEFORE_KEY]: '0em',
    });
    expect(describeParagraphSpacingPending(delta, 0.5, 0)).toBeNull();
  });
});
