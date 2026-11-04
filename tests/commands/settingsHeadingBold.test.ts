import { describe, expect, it } from 'vitest';
import type { AttributeMap } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsHeadingBoldToDelta,
  isHeadingLineTextFullyBold,
  listHeadingLines,
  settingsHeadingBoldPreviewWouldPatchDelta,
} from '../../src/commands/settingsHeadingBold';

function isBold(attrs: AttributeMap | undefined): boolean {
  return attrs?.['bold'] === true;
}

function headerLevel(attrs: AttributeMap | undefined): number | undefined {
  const v = attrs?.['header'];
  return typeof v === 'number' ? v : undefined;
}

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

describe('settingsHeadingBold', () => {
  it('listHeadingLines finds header newlines only', () => {
    const delta = new Delta()
      .insert('Body\n')
      .insert('Title', { bold: true })
      .insert('\n', { header: 1 })
      .insert('Also\n');

    expect(listHeadingLines(delta)).toEqual([
      { newlineIndex: 'Body\nTitle'.length, lineStart: 'Body\n'.length },
    ]);
  });

  it('wouldPatch is true when heading text is not bold', () => {
    const delta = new Delta().insert('Title\n', { header: 2 });
    expect(settingsHeadingBoldPreviewWouldPatchDelta(delta)).toBe(true);
  });

  it('wouldPatch is false when all heading lines are fully bold', () => {
    const delta = new Delta().insert('Title', { bold: true }).insert('\n', { header: 1 });
    const nlIndex = 'Title'.length;
    expect(isHeadingLineTextFullyBold(delta, 0, nlIndex)).toBe(true);
    expect(settingsHeadingBoldPreviewWouldPatchDelta(delta)).toBe(false);
  });

  it('applySettingsHeadingBoldToDelta bolds heading line text', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    const { delta: next, patchedLineCount } = applySettingsHeadingBoldToDelta(delta);

    expect(patchedLineCount).toBe(1);
    expect(isBold(findTextOp(next, 'Title')?.attributes)).toBe(true);
    expect(headerLevel(findTextOp(next, '\n')?.attributes)).toBe(1);
  });

  it('applySettingsHeadingBoldToDelta returns patchedLineCount 0 when already bold', () => {
    const delta = new Delta().insert('Title', { bold: true }).insert('\n', { header: 1 });
    const result = applySettingsHeadingBoldToDelta(delta);
    expect(result.patchedLineCount).toBe(0);
    expect(result.delta).toBe(delta);
  });

  it('applySettingsHeadingBoldToDelta patches multiple headings', () => {
    const delta = new Delta().insert('One\n', { header: 1 }).insert('Two\n', { header: 2 });
    const { patchedLineCount } = applySettingsHeadingBoldToDelta(delta);
    expect(patchedLineCount).toBe(2);
  });
});
