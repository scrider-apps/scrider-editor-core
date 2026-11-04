import { describe, expect, it } from 'vitest';
import type { AttributeMap } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsHeadingSizeGridToDelta,
  isHeadingLineTextFullySized,
  settingsHeadingSizeGridPreviewWouldPatchDelta,
} from '../../src/commands/settingsHeadingSizeGrid';

function findTextOp(
  delta: Delta,
  text: string,
): { insert: string; attributes: AttributeMap | undefined } | undefined {
  for (const op of delta.ops) {
    if (isTextInsert(op) && op.insert === text) {
      return { insert: op.insert, attributes: op.attributes };
    }
  }
  return undefined;
}

describe('settingsHeadingSizeGrid', () => {
  it('wouldPatch is true when heading text has no inline size', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    expect(settingsHeadingSizeGridPreviewWouldPatchDelta(delta, 'scrider')).toBe(true);
  });

  it('wouldPatch is false when heading matches scrider preset size', () => {
    const delta = new Delta().insert('Title', { size: '32pt' }).insert('\n', { header: 1 });
    expect(isHeadingLineTextFullySized(delta, 0, 'Title'.length, '32pt')).toBe(true);
    expect(settingsHeadingSizeGridPreviewWouldPatchDelta(delta, 'scrider')).toBe(false);
  });

  it('wouldPatch is true when heading size differs from selected preset', () => {
    const delta = new Delta().insert('Title', { size: '32pt' }).insert('\n', { header: 1 });
    expect(settingsHeadingSizeGridPreviewWouldPatchDelta(delta, 'google')).toBe(true);
  });

  it('applySettingsHeadingSizeGridToDelta sets preset size on heading text', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    const { delta: next, patchedLineCount } = applySettingsHeadingSizeGridToDelta(delta, 'scrider');

    expect(patchedLineCount).toBe(1);
    expect(findTextOp(next, 'Title')?.attributes?.size).toBe('32pt');
  });

  it('applySettingsHeadingSizeGridToDelta returns patchedLineCount 0 when already applied', () => {
    const delta = new Delta().insert('Title', { size: '32pt' }).insert('\n', { header: 1 });
    const result = applySettingsHeadingSizeGridToDelta(delta, 'scrider');
    expect(result.patchedLineCount).toBe(0);
    expect(result.delta).toBe(delta);
  });

  it('applySettingsHeadingSizeGridToDelta uses level-specific sizes', () => {
    const delta = new Delta().insert('One\n', { header: 1 }).insert('Two\n', { header: 2 });
    const { delta: next, patchedLineCount } = applySettingsHeadingSizeGridToDelta(delta, 'scrider');

    expect(patchedLineCount).toBe(2);
    expect(findTextOp(next, 'One')?.attributes?.size).toBe('32pt');
    expect(findTextOp(next, 'Two')?.attributes?.size).toBe('24pt');
  });
});
