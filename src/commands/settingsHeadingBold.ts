import { compose, isInsert, isTextInsert } from '@scrider/delta';
import type { Delta } from '@scrider/delta';
import { Delta as DeltaClass } from '@scrider/delta';

import { blockAttrsAtNewlineInOp } from '../delta/newlineBlockAttributes';

export interface HeadingLineInfo {
  readonly newlineIndex: number;
  readonly lineStart: number;
}

export interface ApplySettingsHeadingBoldResult {
  delta: Delta;
  patchedLineCount: number;
}

/** Every document line terminated by `\n` with a `header` block attribute. */
export function listHeadingLines(delta: Delta): HeadingLineInfo[] {
  const result: HeadingLineInfo[] = [];
  let pos = 0;
  let lineStart = 0;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n') {
          const attrs = blockAttrsAtNewlineInOp(op, i);
          if (attrs.header != null) {
            result.push({ newlineIndex: pos + i, lineStart });
          }
          lineStart = pos + i + 1;
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
      lineStart = pos;
    }
  }

  return result;
}

function sliceOpHasBold(op: { insert: string; attributes?: Record<string, unknown> }): boolean {
  return op.attributes?.bold === true;
}

/** True when every text op in `[lineStart, newlineIndex)` carries `bold`. */
export function isHeadingLineTextFullyBold(
  delta: Delta,
  lineStart: number,
  newlineIndex: number,
): boolean {
  if (lineStart >= newlineIndex) return true;

  const slice = delta.slice(lineStart, newlineIndex);
  for (const op of slice.ops) {
    if (!isTextInsert(op)) continue;
    if (op.insert.length === 0) continue;
    if (!sliceOpHasBold(op)) return false;
  }
  return true;
}

/**
 * True when Settings heading-bold Apply would set `bold` on any heading line body.
 */
export function settingsHeadingBoldPreviewWouldPatchDelta(delta: Delta): boolean {
  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!isHeadingLineTextFullyBold(delta, line.lineStart, line.newlineIndex)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply `bold: true` to the text body of every heading line in the document.
 */
export function applySettingsHeadingBoldToDelta(delta: Delta): ApplySettingsHeadingBoldResult {
  const lines = listHeadingLines(delta);
  const ranges: { start: number; end: number }[] = [];

  for (const line of lines) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!isHeadingLineTextFullyBold(delta, line.lineStart, line.newlineIndex)) {
      ranges.push({ start: line.lineStart, end: line.newlineIndex });
    }
  }

  if (ranges.length === 0) {
    return { delta, patchedLineCount: 0 };
  }

  let change = new DeltaClass();
  let pos = 0;
  for (const { start, end } of ranges) {
    if (start > pos) change = change.retain(start - pos);
    change = change.retain(end - start, { bold: true });
    pos = end;
  }
  if (pos < delta.length()) change = change.retain(delta.length() - pos);

  return {
    delta: compose(delta, change),
    patchedLineCount: ranges.length,
  };
}
