import type { AttributeMap, Delta } from '@scrider/delta';

import { blockAttrsAtDeltaIndex } from '../delta/newlineBlockAttributes';
import { getHeaderSize, type HeaderSizePresetName } from '../queries/headerDefaults';

import {
  headingLineHasInlineSize,
  settingsHeadingAutoPreviewWouldPatchDelta,
} from './settingsHeadingAuto';
import {
  isHeadingLineTextFullyBold,
  listHeadingLines,
  settingsHeadingBoldPreviewWouldPatchDelta,
} from './settingsHeadingBold';
import {
  settingsHeadingAlignPreviewWouldPatchDelta,
  type SettingsHeadingAlign,
} from './settingsHeadingAlign';
import {
  isHeadingLineTextFullySized,
  settingsHeadingSizeGridPreviewWouldPatchDelta,
} from './settingsHeadingSizeGrid';
import {
  formatLineSpacingDeltaValue,
  listLineSpacingBlockNewlineIndices,
  SCRIDER_LINE_HEIGHT_KEY,
  settingsLineSpacingPreviewWouldPatchDelta,
} from './settingsLineSpacing';
import {
  formatParagraphSpacingDeltaValue,
  listParagraphSpacingBlockNewlineIndices,
  marginEmMatchesTarget,
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
  settingsParagraphSpacingPreviewWouldPatchDelta,
} from './settingsParagraphSpacing';

export interface SettingsPreviewMismatch {
  blockLabel: string;
  attribute: string;
  current: string;
  expected: string;
}

export interface SettingsPreviewPendingReason {
  id: string;
  title: string;
  summary: string;
  mismatches: SettingsPreviewMismatch[];
}

const MAX_MISMATCHES = 8;

function blockKindLabel(attrs: AttributeMap): string {
  if (attrs.header != null) {
    const level = attrs.header;
    if (typeof level === 'number' || typeof level === 'string') {
      return `heading ${level}`;
    }
    return 'heading';
  }
  if (attrs.list != null) return 'list item';
  if (attrs.blockquote != null) return 'blockquote';
  if (attrs['code-block'] != null) return 'code block';
  return 'paragraph';
}

function formatAttrValue(value: unknown): string {
  if (value == null) return '(missing)';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatParagraphSpacingExpected(em: number): string {
  return em === 0 ? '(absent)' : formatParagraphSpacingDeltaValue(em);
}

function capMismatches(mismatches: SettingsPreviewMismatch[]): SettingsPreviewMismatch[] {
  return mismatches.slice(0, MAX_MISMATCHES);
}

export function describeLineSpacingPending(
  delta: Delta,
  multiplier: number,
): SettingsPreviewPendingReason | null {
  if (!settingsLineSpacingPreviewWouldPatchDelta(delta, multiplier)) return null;

  const target = formatLineSpacingDeltaValue(multiplier);
  const mismatches: SettingsPreviewMismatch[] = [];
  let blockNum = 0;

  for (const nlIndex of listLineSpacingBlockNewlineIndices(delta)) {
    blockNum += 1;
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    const current = attrs[SCRIDER_LINE_HEIGHT_KEY];
    if (typeof current === 'string' && current === target) continue;
    mismatches.push({
      blockLabel: `${blockKindLabel(attrs)} #${blockNum}`,
      attribute: SCRIDER_LINE_HEIGHT_KEY,
      current: formatAttrValue(current),
      expected: target,
    });
  }

  return {
    id: 'line-spacing',
    title: 'Line spacing',
    summary: `Settings line height ${multiplier} is not baked into Delta on ${mismatches.length} block line(s).`,
    mismatches: capMismatches(mismatches),
  };
}

export function describeParagraphSpacingPending(
  delta: Delta,
  afterEm: number,
  beforeEm: number,
): SettingsPreviewPendingReason | null {
  if (!settingsParagraphSpacingPreviewWouldPatchDelta(delta, afterEm, beforeEm)) return null;

  const mismatches: SettingsPreviewMismatch[] = [];
  let blockNum = 0;

  for (const nlIndex of listParagraphSpacingBlockNewlineIndices(delta)) {
    blockNum += 1;
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    const currentAfter = attrs[SCRIDER_MARGIN_AFTER_KEY];
    const currentBefore = attrs[SCRIDER_MARGIN_BEFORE_KEY];

    if (!marginEmMatchesTarget(currentAfter, afterEm)) {
      mismatches.push({
        blockLabel: `${blockKindLabel(attrs)} #${blockNum}`,
        attribute: SCRIDER_MARGIN_AFTER_KEY,
        current: formatAttrValue(currentAfter),
        expected: formatParagraphSpacingExpected(afterEm),
      });
    }
    if (!marginEmMatchesTarget(currentBefore, beforeEm)) {
      mismatches.push({
        blockLabel: `${blockKindLabel(attrs)} #${blockNum}`,
        attribute: SCRIDER_MARGIN_BEFORE_KEY,
        current: formatAttrValue(currentBefore),
        expected: formatParagraphSpacingExpected(beforeEm),
      });
    }
  }

  return {
    id: 'paragraph-spacing',
    title: 'Paragraph spacing',
    summary: `Settings before ${beforeEm}em / after ${afterEm}em is not baked into Delta on plain paragraph(s).`,
    mismatches: capMismatches(mismatches),
  };
}

export function describeHeadingBoldPending(delta: Delta): SettingsPreviewPendingReason | null {
  if (!settingsHeadingBoldPreviewWouldPatchDelta(delta)) return null;

  const mismatches: SettingsPreviewPendingReason['mismatches'] = [];
  let headingNum = 0;

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (isHeadingLineTextFullyBold(delta, line.lineStart, line.newlineIndex)) continue;
    headingNum += 1;
    const attrs = blockAttrsAtDeltaIndex(delta, line.newlineIndex);
    mismatches.push({
      blockLabel: `${blockKindLabel(attrs)} #${headingNum}`,
      attribute: 'bold',
      current: 'not on all text',
      expected: 'bold on heading text',
    });
  }

  return {
    id: 'heading-bold',
    title: 'Heading bold',
    summary: `Bold preview is not stored in Delta on ${mismatches.length} heading(s).`,
    mismatches: capMismatches(mismatches),
  };
}

export function describeHeadingAlignPending(
  delta: Delta,
  align: SettingsHeadingAlign,
): SettingsPreviewPendingReason | null {
  if (!settingsHeadingAlignPreviewWouldPatchDelta(delta, align)) return null;

  const target = align === 'left' ? '(missing)' : align;
  const mismatches: SettingsPreviewPendingReason['mismatches'] = [];
  let headingNum = 0;

  for (const line of listHeadingLines(delta)) {
    headingNum += 1;
    const attrs = blockAttrsAtDeltaIndex(delta, line.newlineIndex);
    const raw = attrs.align;
    const current =
      raw == null || raw === 'left'
        ? '(missing)'
        : typeof raw === 'string'
          ? raw
          : typeof raw === 'number' || typeof raw === 'boolean'
            ? String(raw)
            : JSON.stringify(raw);
    if (current === target) continue;
    mismatches.push({
      blockLabel: `${blockKindLabel(attrs)} #${headingNum}`,
      attribute: 'align',
      current,
      expected: target,
    });
  }

  return {
    id: 'heading-align',
    title: 'Heading alignment',
    summary: `Settings alignment "${align}" is not baked into Delta on ${mismatches.length} heading(s).`,
    mismatches: capMismatches(mismatches),
  };
}

export function describeHeadingSizeGridPending(
  delta: Delta,
  preset: HeaderSizePresetName,
): SettingsPreviewPendingReason | null {
  if (!settingsHeadingSizeGridPreviewWouldPatchDelta(delta, preset)) return null;

  const mismatches: SettingsPreviewPendingReason['mismatches'] = [];
  let headingNum = 0;

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    const attrs = blockAttrsAtDeltaIndex(delta, line.newlineIndex);
    const level = attrs.header;
    const targetSize = getHeaderSize(level, preset);
    if (targetSize == null) continue;
    if (isHeadingLineTextFullySized(delta, line.lineStart, line.newlineIndex, targetSize)) continue;
    headingNum += 1;
    mismatches.push({
      blockLabel: `${blockKindLabel(attrs)} #${headingNum}`,
      attribute: 'size',
      current: 'differs from preset',
      expected: targetSize,
    });
  }

  return {
    id: 'heading-size-grid',
    title: 'Heading size grid',
    summary: `Size grid preset "${preset}" is not baked into Delta on ${mismatches.length} heading(s).`,
    mismatches: capMismatches(mismatches),
  };
}

export function describeHeadingAutoPending(delta: Delta): SettingsPreviewPendingReason | null {
  if (!settingsHeadingAutoPreviewWouldPatchDelta(delta)) return null;

  const mismatches: SettingsPreviewPendingReason['mismatches'] = [];
  let headingNum = 0;

  for (const line of listHeadingLines(delta)) {
    if (line.lineStart >= line.newlineIndex) continue;
    if (!headingLineHasInlineSize(delta, line.lineStart, line.newlineIndex)) continue;
    headingNum += 1;
    const attrs = blockAttrsAtDeltaIndex(delta, line.newlineIndex);
    mismatches.push({
      blockLabel: `${blockKindLabel(attrs)} #${headingNum}`,
      attribute: 'size',
      current: 'inline size present',
      expected: '(removed — implicit grid)',
    });
  }

  return {
    id: 'heading-auto',
    title: 'Heading auto sizes',
    summary: `Auto mode would strip inline size from ${mismatches.length} heading(s).`,
    mismatches: capMismatches(mismatches),
  };
}
