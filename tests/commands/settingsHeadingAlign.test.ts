import { describe, expect, it } from 'vitest';
import type { AttributeMap } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsHeadingAlignToDelta,
  settingsHeadingAlignPreviewWouldPatchDelta,
} from '../../src/commands/settingsHeadingAlign';

function findNewlineOp(
  delta: Delta,
): { insert: string; attributes: AttributeMap | undefined } | undefined {
  for (const op of delta.ops) {
    if (isTextInsert(op) && op.insert === '\n') {
      return { insert: op.insert, attributes: op.attributes };
    }
  }
  return undefined;
}

describe('settingsHeadingAlign', () => {
  it('wouldPatch is true when heading align differs from target', () => {
    const delta = new Delta().insert('Title\n', { header: 1, align: 'right' });
    expect(settingsHeadingAlignPreviewWouldPatchDelta(delta, 'center')).toBe(true);
  });

  it('wouldPatch is false when all headings match center', () => {
    const delta = new Delta().insert('Title\n', { header: 1, align: 'center' });
    expect(settingsHeadingAlignPreviewWouldPatchDelta(delta, 'center')).toBe(false);
  });

  it('wouldPatch is false when headings are left (no align attr)', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    expect(settingsHeadingAlignPreviewWouldPatchDelta(delta, 'left')).toBe(false);
  });

  it('applySettingsHeadingAlignToDelta sets align on heading newline', () => {
    const delta = new Delta().insert('Title\n', { header: 1 });
    const { delta: next, patchedLineCount } = applySettingsHeadingAlignToDelta(delta, 'center');

    expect(patchedLineCount).toBe(1);
    expect(findNewlineOp(next)?.attributes?.align).toBe('center');
    expect(findNewlineOp(next)?.attributes?.header).toBe(1);
  });

  it('applySettingsHeadingAlignToDelta clears align for left', () => {
    const delta = new Delta().insert('Title\n', { header: 1, align: 'center' });
    const { delta: next, patchedLineCount } = applySettingsHeadingAlignToDelta(delta, 'left');

    expect(patchedLineCount).toBe(1);
    expect(findNewlineOp(next)?.attributes?.align).toBeUndefined();
  });

  it('applySettingsHeadingAlignToDelta returns patchedLineCount 0 when already applied', () => {
    const delta = new Delta().insert('Title\n', { header: 1, align: 'right' });
    const result = applySettingsHeadingAlignToDelta(delta, 'right');
    expect(result.patchedLineCount).toBe(0);
    expect(result.delta).toBe(delta);
  });

  it('applySettingsHeadingAlignToDelta patches multiple headings', () => {
    const delta = new Delta().insert('One\n', { header: 1 }).insert('Two\n', { header: 2 });
    const { patchedLineCount } = applySettingsHeadingAlignToDelta(delta, 'center');
    expect(patchedLineCount).toBe(2);
  });
});
