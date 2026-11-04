import { compose, isInsert, isTextInsert, Delta as DeltaClass } from '@scrider/delta';
import type { AttributeMap, Delta } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtDeltaIndex,
  SCRIDER_TEXT_INDENT_KEY,
} from '../delta/newlineBlockAttributes';
import type { HeaderSizePresetName } from '../queries/headerDefaults';

import { isHeadingLineTextFullyBold, listHeadingLines } from './settingsHeadingBold';
import { headingLineHasInlineSize } from './settingsHeadingAuto';
import type { SettingsHeadingAlign } from './settingsHeadingAlign';
import { isHeadingLineTextFullySized } from './settingsHeadingSizeGrid';
import { getHeaderSize } from '../queries/headerDefaults';
import {
  formatLineSpacingDeltaValue,
  isLineSpacingBlock,
  SCRIDER_LINE_HEIGHT_KEY,
} from './settingsLineSpacing';
import {
  formatParagraphSpacingDeltaValue,
  isParagraphSpacingBlock,
  marginEmMatchesTarget,
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
} from './settingsParagraphSpacing';

export interface DocumentSettingsPasteBakeOptions {
  lineSpacing?: number;
  paragraphSpacingAfterEm?: number;
  paragraphSpacingBeforeEm?: number;
  textIndentCm?: number;
  headingBold?: boolean;
  headingAlign?: SettingsHeadingAlign;
  headingSizeGridPreset?: HeaderSizePresetName;
  headingAuto?: boolean;
}

export interface BakeDocumentSettingsOnPasteResult {
  delta: Delta;
  patchedCount: number;
}

/** Every `\n` index in `[start, endExclusive)`. */
export function listNewlineIndicesInCharRange(
  delta: Delta,
  start: number,
  endExclusive: number,
): number[] {
  const indices: number[] = [];
  let pos = 0;

  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      pos += isInsert(op) ? 1 : 0;
      continue;
    }
    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] !== '\n') continue;
      const index = pos + i;
      if (index >= start && index < endExclusive) {
        indices.push(index);
      }
    }
    pos += op.insert.length;
  }

  return indices;
}

function deltaCharAt(delta: Delta, index: number): string | undefined {
  if (index < 0 || index >= delta.length()) return undefined;
  const slice = delta.slice(index, index + 1);
  for (const op of slice.ops) {
    if (isTextInsert(op) && op.insert.length > 0) return op.insert[0];
  }
  return undefined;
}

/**
 * Paste compose may merge the document's trailing `\n` into the last pasted text op
 * (`{ insert: "line\\n" }` without block attrs). Extend bake range to include it.
 */
export function resolvePasteBakeEndExclusive(
  delta: Delta,
  insertIndex: number,
  insertedLength: number,
): number {
  const end = insertIndex + insertedLength;
  if (end < delta.length() && deltaCharAt(delta, end) === '\n') {
    return end + 1;
  }
  return end;
}

function headingLineInPasteRange(
  lineStart: number,
  newlineIndex: number,
  pasteStart: number,
  pasteEnd: number,
): boolean {
  return lineStart < pasteEnd && newlineIndex >= pasteStart;
}

function applyLineSpacingInRange(
  delta: Delta,
  multiplier: number,
  newlineIndices: readonly number[],
): { delta: Delta; patchedCount: number } {
  const target = formatLineSpacingDeltaValue(multiplier);
  const patches = new Map<number, AttributeMap>();

  for (const nlIndex of newlineIndices) {
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    if (!isLineSpacingBlock(attrs)) continue;
    if (attrs[SCRIDER_LINE_HEIGHT_KEY] === target) continue;
    patches.set(nlIndex, { [SCRIDER_LINE_HEIGHT_KEY]: target });
  }

  if (patches.size === 0) {
    return { delta, patchedCount: 0 };
  }

  return {
    delta: applyAttributePatchesAtNewlines(delta, patches),
    patchedCount: patches.size,
  };
}

function applyParagraphSpacingInRange(
  delta: Delta,
  afterEm: number,
  beforeEm: number,
  newlineIndices: readonly number[],
): { delta: Delta; patchedCount: number } {
  const targetAfter = formatParagraphSpacingDeltaValue(afterEm);
  const targetBefore = formatParagraphSpacingDeltaValue(beforeEm);
  const patches = new Map<number, AttributeMap>();

  for (const nlIndex of newlineIndices) {
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    if (!isParagraphSpacingBlock(attrs)) continue;

    const patch: AttributeMap = {};
    const currentAfter = attrs[SCRIDER_MARGIN_AFTER_KEY];
    const currentBefore = attrs[SCRIDER_MARGIN_BEFORE_KEY];
    if (!marginEmMatchesTarget(currentAfter, afterEm)) {
      patch[SCRIDER_MARGIN_AFTER_KEY] = afterEm === 0 ? null : targetAfter;
    }
    if (!marginEmMatchesTarget(currentBefore, beforeEm)) {
      patch[SCRIDER_MARGIN_BEFORE_KEY] = beforeEm === 0 ? null : targetBefore;
    }
    if (Object.keys(patch).length > 0) {
      patches.set(nlIndex, patch);
    }
  }

  if (patches.size === 0) {
    return { delta, patchedCount: 0 };
  }

  return {
    delta: applyAttributePatchesAtNewlines(delta, patches),
    patchedCount: patches.size,
  };
}

function applyTextIndentInRange(
  delta: Delta,
  indentCm: number,
  newlineIndices: readonly number[],
): { delta: Delta; patchedCount: number } {
  const indent = `${indentCm}cm`;
  const patches = new Map<number, AttributeMap>();

  for (const nlIndex of newlineIndices) {
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    if (!isParagraphSpacingBlock(attrs)) continue;
    if (attrs[SCRIDER_TEXT_INDENT_KEY] === indent) continue;
    patches.set(nlIndex, { [SCRIDER_TEXT_INDENT_KEY]: indent });
  }

  if (patches.size === 0) {
    return { delta, patchedCount: 0 };
  }

  return {
    delta: applyAttributePatchesAtNewlines(delta, patches),
    patchedCount: patches.size,
  };
}

function applyHeadingBoldInRange(
  delta: Delta,
  pasteStart: number,
  pasteEnd: number,
): { delta: Delta; patchedLineCount: number } {
  const ranges: { start: number; end: number }[] = [];

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!headingLineInPasteRange(line.lineStart, line.newlineIndex, pasteStart, pasteEnd)) {
      continue;
    }
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

function applyHeadingAlignInRange(
  delta: Delta,
  align: SettingsHeadingAlign,
  pasteStart: number,
  pasteEnd: number,
): { delta: Delta; patchedLineCount: number } {
  const target = align === 'left' ? null : align;
  const patches = new Map<number, AttributeMap>();

  for (const line of listHeadingLines(delta)) {
    if (!headingLineInPasteRange(line.lineStart, line.newlineIndex, pasteStart, pasteEnd)) {
      continue;
    }
    const attrs = blockAttrsAtDeltaIndex(delta, line.newlineIndex);
    const current = attrs.align;
    const normalized =
      current == null || current === 'left' ? null : typeof current === 'string' ? current : null;
    if (normalized === target) continue;
    patches.set(line.newlineIndex, { align: target });
  }

  if (patches.size === 0) {
    return { delta, patchedLineCount: 0 };
  }

  return {
    delta: applyAttributePatchesAtNewlines(delta, patches),
    patchedLineCount: patches.size,
  };
}

function applyHeadingSizeGridInRange(
  delta: Delta,
  preset: HeaderSizePresetName,
  pasteStart: number,
  pasteEnd: number,
): { delta: Delta; patchedLineCount: number } {
  const patches: { start: number; end: number; size: string }[] = [];

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!headingLineInPasteRange(line.lineStart, line.newlineIndex, pasteStart, pasteEnd)) {
      continue;
    }
    const level = blockAttrsAtDeltaIndex(delta, line.newlineIndex).header;
    const targetSize = getHeaderSize(level, preset);
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

function applyHeadingAutoInRange(
  delta: Delta,
  pasteStart: number,
  pasteEnd: number,
): { delta: Delta; patchedLineCount: number } {
  const ranges: { start: number; end: number }[] = [];

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!headingLineInPasteRange(line.lineStart, line.newlineIndex, pasteStart, pasteEnd)) {
      continue;
    }
    if (headingLineHasInlineSize(delta, line.lineStart, line.newlineIndex)) {
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
    change = change.retain(end - start, { size: null });
    pos = end;
  }
  if (pos < delta.length()) change = change.retain(delta.length() - pos);

  return {
    delta: compose(delta, change),
    patchedLineCount: ranges.length,
  };
}

/**
 * Stamp active document Settings onto plain paragraphs / headings in the pasted range.
 * Does not touch blocks outside `[insertIndex, insertIndex + insertedLength)`.
 */
export function bakeDocumentSettingsOnPasteDelta(
  delta: Delta,
  insertIndex: number,
  insertedLength: number,
  options: DocumentSettingsPasteBakeOptions,
): BakeDocumentSettingsOnPasteResult {
  if (insertedLength <= 0) {
    return { delta, patchedCount: 0 };
  }

  const pasteEnd = resolvePasteBakeEndExclusive(delta, insertIndex, insertedLength);
  const newlineIndices = listNewlineIndicesInCharRange(delta, insertIndex, pasteEnd);
  let result = delta;
  let patchedCount = 0;

  if (typeof options.lineSpacing === 'number' && options.lineSpacing > 0) {
    const next = applyLineSpacingInRange(result, options.lineSpacing, newlineIndices);
    result = next.delta;
    patchedCount += next.patchedCount;
  }

  if (
    typeof options.paragraphSpacingAfterEm === 'number' &&
    options.paragraphSpacingAfterEm >= 0 &&
    typeof options.paragraphSpacingBeforeEm === 'number' &&
    options.paragraphSpacingBeforeEm >= 0
  ) {
    const next = applyParagraphSpacingInRange(
      result,
      options.paragraphSpacingAfterEm,
      options.paragraphSpacingBeforeEm,
      newlineIndices,
    );
    result = next.delta;
    patchedCount += next.patchedCount;
  }

  if (typeof options.textIndentCm === 'number' && options.textIndentCm > 0) {
    const next = applyTextIndentInRange(result, options.textIndentCm, newlineIndices);
    result = next.delta;
    patchedCount += next.patchedCount;
  }

  if (options.headingBold) {
    const next = applyHeadingBoldInRange(result, insertIndex, pasteEnd);
    result = next.delta;
    patchedCount += next.patchedLineCount;
  }

  if (options.headingAlign != null) {
    const next = applyHeadingAlignInRange(result, options.headingAlign, insertIndex, pasteEnd);
    result = next.delta;
    patchedCount += next.patchedLineCount;
  }

  if (options.headingSizeGridPreset != null) {
    const next = applyHeadingSizeGridInRange(
      result,
      options.headingSizeGridPreset,
      insertIndex,
      pasteEnd,
    );
    result = next.delta;
    patchedCount += next.patchedLineCount;
  }

  if (options.headingAuto) {
    const next = applyHeadingAutoInRange(result, insertIndex, pasteEnd);
    result = next.delta;
    patchedCount += next.patchedLineCount;
  }

  return { delta: result, patchedCount };
}

/** Single trailing `\n` with no other content — empty document skeleton. */
export function isSkeletonOnlyDelta(delta: Delta): boolean {
  const ops = delta.ops ?? [];
  if (ops.length !== 1) return false;
  const op = ops[0];
  if (op == null) return false;
  return isTextInsert(op) && op.insert === '\n';
}

/** Stamp active document Settings onto the empty skeleton paragraph. */
export function bakeDocumentSettingsOnSkeletonDelta(
  delta: Delta,
  options: DocumentSettingsPasteBakeOptions,
): BakeDocumentSettingsOnPasteResult {
  if (!isSkeletonOnlyDelta(delta)) {
    return { delta, patchedCount: 0 };
  }
  return bakeDocumentSettingsOnPasteDelta(delta, 0, 1, options);
}
