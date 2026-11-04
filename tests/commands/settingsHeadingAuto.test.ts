import { describe, expect, it } from 'vitest';
import type { AttributeMap } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsHeadingAutoToDelta,
  headingLineHasInlineSize,
  settingsHeadingAutoPreviewWouldPatchDelta,
} from '../../src/commands/settingsHeadingAuto';

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

describe('settingsHeadingAuto', () => {
  it('wouldPatch is true when heading has inline size', () => {
    const delta = new Delta().insert('Title', { size: '32pt' }).insert('\n', { header: 1 });
    expect(settingsHeadingAutoPreviewWouldPatchDelta(delta)).toBe(true);
  });

  it('wouldPatch is false when heading has no inline size', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    expect(settingsHeadingAutoPreviewWouldPatchDelta(delta)).toBe(false);
  });

  it('headingLineHasInlineSize detects size on heading body', () => {
    const delta = new Delta().insert('Title', { size: '26pt' }).insert('\n', { header: 1 });
    expect(headingLineHasInlineSize(delta, 0, 'Title'.length)).toBe(true);
  });

  it('applySettingsHeadingAutoToDelta strips size from heading lines', () => {
    const delta = new Delta().insert('Title', { size: '32pt' }).insert('\n', { header: 1 });
    const { delta: next, patchedLineCount } = applySettingsHeadingAutoToDelta(delta);

    expect(patchedLineCount).toBe(1);
    expect(findTextOp(next, 'Title')?.attributes?.size).toBeUndefined();
  });

  it('applySettingsHeadingAutoToDelta returns patchedLineCount 0 when already implicit', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    const result = applySettingsHeadingAutoToDelta(delta);
    expect(result.patchedLineCount).toBe(0);
    expect(result.delta).toBe(delta);
  });

  it('applySettingsHeadingAutoToDelta strips multiple headings', () => {
    const delta = new Delta()
      .insert('One', { size: '32pt' })
      .insert('\n', { header: 1 })
      .insert('Two', { size: '24pt' })
      .insert('\n', { header: 2 });
    const { patchedLineCount } = applySettingsHeadingAutoToDelta(delta);
    expect(patchedLineCount).toBe(2);
  });

  it('does not strip size from plain paragraphs', () => {
    const delta = new Delta().insert('Body', { size: '14pt' }).insert('\n');
    const { delta: next, patchedLineCount } = applySettingsHeadingAutoToDelta(delta);
    expect(patchedLineCount).toBe(0);
    expect(findTextOp(next, 'Body')?.attributes?.size).toBe('14pt');
  });
});
