import { compose, isTextInsert } from '@scrider/delta';
import type { Delta } from '@scrider/delta';
import { Delta as DeltaClass } from '@scrider/delta';

import { blockAttrsAtDeltaIndex } from '../delta/newlineBlockAttributes';
import { getHeaderSize, type HeaderSizePresetName } from '../queries/headerDefaults';

import { listHeadingLines, type HeadingLineInfo } from './settingsHeadingBold';

export interface ApplySettingsHeadingSizeGridResult {
  delta: Delta;
  patchedLineCount: number;
}

function targetSizeForLine(
  delta: Delta,
  line: HeadingLineInfo,
  preset: HeaderSizePresetName,
): string | null {
  const level = blockAttrsAtDeltaIndex(delta, line.newlineIndex).header;
  return getHeaderSize(level, preset);
}

function sliceOpHasSize(
  op: { insert: string; attributes?: Record<string, unknown> },
  targetSize: string,
): boolean {
  return op.attributes?.size === targetSize;
}

/** True when every text op in `[lineStart, newlineIndex)` carries `size: targetSize`. */
export function isHeadingLineTextFullySized(
  delta: Delta,
  lineStart: number,
  newlineIndex: number,
  targetSize: string,
): boolean {
  if (lineStart >= newlineIndex) return true;

  const slice = delta.slice(lineStart, newlineIndex);
  for (const op of slice.ops) {
    if (!isTextInsert(op)) continue;
    if (op.insert.length === 0) continue;
    if (!sliceOpHasSize(op, targetSize)) return false;
  }
  return true;
}

/**
 * True when Settings size-grid Apply would set preset `size` on any heading line body.
 */
export function settingsHeadingSizeGridPreviewWouldPatchDelta(
  delta: Delta,
  preset: HeaderSizePresetName,
): boolean {
  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    const targetSize = targetSizeForLine(delta, line, preset);
    if (targetSize == null) continue;
    if (!isHeadingLineTextFullySized(delta, line.lineStart, line.newlineIndex, targetSize)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply preset heading sizes as inline `size` on every heading line body.
 */
export function applySettingsHeadingSizeGridToDelta(
  delta: Delta,
  preset: HeaderSizePresetName,
): ApplySettingsHeadingSizeGridResult {
  const patches: { start: number; end: number; size: string }[] = [];

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    const targetSize = targetSizeForLine(delta, line, preset);
    if (targetSize == null) continue;
    if (isHeadingLineTextFullySized(delta, line.lineStart, line.newlineIndex, targetSize)) {
      continue;
    }
    patches.push({ start: line.lineStart, end: line.newlineIndex, size: targetSize });
  }

  if (patches.length === 0) {
    return { delta, patchedLineCount: 0 };
  }

  let change = new DeltaClass();
  let pos = 0;
  for (const { start, end, size } of patches) {
    if (start > pos) change = change.retain(start - pos);
    change = change.retain(end - start, { size });
    pos = end;
  }
  if (pos < delta.length()) change = change.retain(delta.length() - pos);

  return {
    delta: compose(delta, change),
    patchedLineCount: patches.length,
  };
}
