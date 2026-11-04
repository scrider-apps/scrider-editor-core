import type { AttributeMap, Delta } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtDeltaIndex,
} from '../delta/newlineBlockAttributes';

import { listHeadingLines } from './settingsHeadingBold';

export type SettingsHeadingAlign = 'left' | 'center' | 'right';

export interface ApplySettingsHeadingAlignResult {
  delta: Delta;
  patchedLineCount: number;
}

function targetAlignAttr(align: SettingsHeadingAlign): string | null {
  return align === 'left' ? null : align;
}

function normalizedAlignAttr(attrs: AttributeMap): string | null {
  const value = attrs.align;
  if (value == null || value === 'left') return null;
  if (typeof value === 'string') return value;
  return null;
}

/**
 * True when Settings heading-align Apply would change `align` on any heading `\n`.
 */
export function settingsHeadingAlignPreviewWouldPatchDelta(
  delta: Delta,
  align: SettingsHeadingAlign,
): boolean {
  const target = targetAlignAttr(align);
  for (const line of listHeadingLines(delta)) {
    const current = normalizedAlignAttr(blockAttrsAtDeltaIndex(delta, line.newlineIndex));
    if (current !== target) return true;
  }
  return false;
}

/**
 * Apply document heading alignment on every heading `\n` (`align` block attr).
 */
export function applySettingsHeadingAlignToDelta(
  delta: Delta,
  align: SettingsHeadingAlign,
): ApplySettingsHeadingAlignResult {
  const target = targetAlignAttr(align);
  const patches = new Map<number, AttributeMap>();

  for (const line of listHeadingLines(delta)) {
    const current = normalizedAlignAttr(blockAttrsAtDeltaIndex(delta, line.newlineIndex));
    if (current === target) continue;
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
