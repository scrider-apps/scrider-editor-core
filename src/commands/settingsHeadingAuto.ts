import { compose, isInsert, isTextInsert } from '@scrider/delta';
import type { Delta } from '@scrider/delta';
import { Delta as DeltaClass } from '@scrider/delta';

import { isHeaderLevel } from '../queries/headerDefaults';

import { listHeadingLines } from './settingsHeadingBold';

export interface ApplySettingsHeadingAutoResult {
  delta: Delta;
  patchedLineCount: number;
}

/** True when any text op in `[lineStart, newlineIndex)` carries inline `size`. */
export function headingLineHasInlineSize(
  delta: Delta,
  lineStart: number,
  newlineIndex: number,
): boolean {
  if (lineStart >= newlineIndex) return false;

  const slice = delta.slice(lineStart, newlineIndex);
  for (const op of slice.ops) {
    if (!isTextInsert(op)) continue;
    if (op.insert.length === 0) continue;
    if (op.attributes?.size != null) return true;
  }
  return false;
}

/**
 * True when Settings Auto Apply would strip inline `size` from any heading line.
 */
export function settingsHeadingAutoPreviewWouldPatchDelta(delta: Delta): boolean {
  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (headingLineHasInlineSize(delta, line.lineStart, line.newlineIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * Strip inline `size` from every heading line body (implicit Scrider grid).
 */
export function applySettingsHeadingAutoToDelta(delta: Delta): ApplySettingsHeadingAutoResult {
  interface OpRange {
    start: number;
    end: number;
    hasSize: boolean;
  }

  const opRanges: OpRange[] = [];
  {
    let pos = 0;
    for (const op of delta.ops) {
      if (!isInsert(op)) continue;
      const len = isTextInsert(op) ? op.insert.length : 1;
      opRanges.push({
        start: pos,
        end: pos + len,
        hasSize: op.attributes?.size != null,
      });
      pos += len;
    }
  }

  const blockHasSize = (start: number, end: number): boolean => {
    for (const r of opRanges) {
      if (r.end <= start) continue;
      if (r.start >= end) break;
      if (r.hasSize) return true;
    }
    return false;
  };

  let change = new DeltaClass();
  let cursor = 0;
  let pos = 0;
  let blockStart = 0;
  let patchedLineCount = 0;

  for (const op of delta.ops) {
    if (!isInsert(op)) continue;
    if (!isTextInsert(op)) {
      pos += 1;
      continue;
    }
    const text = op.insert;
    let i = 0;
    while (i < text.length) {
      const nl = text.indexOf('\n', i);
      if (nl === -1) {
        pos += text.length - i;
        break;
      }
      pos += nl - i;
      const blockEnd = pos + 1;
      if (isHeaderLevel(op.attributes?.header) && blockHasSize(blockStart, blockEnd)) {
        if (blockStart > cursor) change = change.retain(blockStart - cursor);
        change = change.retain(blockEnd - blockStart, { size: null });
        cursor = blockEnd;
        patchedLineCount += 1;
      }
      pos += 1;
      blockStart = pos;
      i = nl + 1;
    }
  }

  if (patchedLineCount === 0) {
    return { delta, patchedLineCount: 0 };
  }

  if (cursor < delta.length()) change = change.retain(delta.length() - cursor);

  return {
    delta: compose(delta, change),
    patchedLineCount,
  };
}
