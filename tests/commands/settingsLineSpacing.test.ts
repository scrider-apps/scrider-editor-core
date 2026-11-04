import { describe, it, expect } from 'vitest';

import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsLineSpacingToDelta,
  SCRIDER_LINE_HEIGHT_KEY,
  settingsLineSpacingPreviewWouldPatchDelta,
} from '../../src/commands/settingsLineSpacing';

describe('settingsLineSpacing', () => {
  it('preview pending when no block attrs and multiplier set', () => {
    const delta = new Delta().insert('Body').insert('\n');
    expect(settingsLineSpacingPreviewWouldPatchDelta(delta, 1.5)).toBe(true);
  });

  it('preview not pending when all eligible lines match', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { [SCRIDER_LINE_HEIGHT_KEY]: '1.5' })
      .insert('B')
      .insert('\n', { list: 'bullet', [SCRIDER_LINE_HEIGHT_KEY]: '1.5' });

    expect(settingsLineSpacingPreviewWouldPatchDelta(delta, 1.5)).toBe(false);
  });

  it('skips headings', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 1 })
      .insert('Body')
      .insert('\n');

    const { delta: next, patchedCount } = applySettingsLineSpacingToDelta(delta, 2);
    expect(patchedCount).toBe(1);
    const nlOps = next.ops.filter(
      (op): op is { insert: string; attributes?: Record<string, unknown> } =>
        isTextInsert(op) && op.insert === '\n',
    );
    expect(nlOps).toHaveLength(2);
    expect(nlOps[0]?.attributes?.[SCRIDER_LINE_HEIGHT_KEY]).toBeUndefined();
    expect(nlOps[1]?.attributes?.[SCRIDER_LINE_HEIGHT_KEY]).toBe('2');
  });

  it('apply patches list items and blockquote', () => {
    const delta = new Delta()
      .insert('Item')
      .insert('\n', { list: 'bullet' })
      .insert('Quote')
      .insert('\n', { blockquote: true });

    const { patchedCount } = applySettingsLineSpacingToDelta(delta, 1.15);
    expect(patchedCount).toBe(2);
  });
});
