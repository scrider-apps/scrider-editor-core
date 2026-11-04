import type { AttributeMap, Delta } from '@scrider/delta';
import { isInsert, isTextInsert } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtDeltaIndex,
  blockAttrsAtNewlineInOp,
} from '../delta/newlineBlockAttributes';

export const SCRIDER_MARGIN_AFTER_KEY = 'scrider-margin-after';
export const SCRIDER_MARGIN_BEFORE_KEY = 'scrider-margin-before';

export interface ApplySettingsParagraphSpacingResult {
  delta: Delta;
  patchedCount: number;
}

/** Plain `<p>` only — not headings, lists, blockquote, code-block, or table rows. */
export function isParagraphSpacingBlock(attrs: AttributeMap): boolean {
  if (attrs.header != null) return false;
  if (attrs.list != null) return false;
  if (attrs.blockquote != null) return false;
  if (attrs['code-block'] != null) return false;
  if (attrs['table-row'] != null) return false;
  return true;
}

export function parseScriderMarginEm(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const emMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*em$/i);
  if (emMatch) {
    const n = Number.parseFloat(emMatch[1]!);
    if (Number.isFinite(n) && n >= 0) return n;
    return undefined;
  }

  const n = Number.parseFloat(trimmed);
  if (Number.isFinite(n) && n >= 0) return n;
  return undefined;
}

export const parseScriderMarginAfterEm = parseScriderMarginEm;
export const parseScriderMarginBeforeEm = parseScriderMarginEm;

export function formatParagraphSpacingDeltaValue(em: number): string {
  const rounded = Math.round(em * 100) / 100;
  return `${rounded}em`;
}

/** Settings `0` and missing/`0em` in Delta are equivalent (no preview pending). */
export function marginEmMatchesTarget(current: unknown, targetEm: number): boolean {
  const parsed = typeof current === 'string' ? parseScriderMarginEm(current) : undefined;

  if (targetEm === 0) {
    return parsed === undefined || parsed === 0;
  }

  if (parsed === undefined) return false;
  const roundedTarget = Math.round(targetEm * 100) / 100;
  const roundedParsed = Math.round(parsed * 100) / 100;
  return roundedParsed === roundedTarget;
}

/** Every `\n` that terminates a plain paragraph eligible for document spacing after. */
export function listParagraphSpacingBlockNewlineIndices(delta: Delta): number[] {
  const indices: number[] = [];
  let pos = 0;

  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      pos += isInsert(op) ? 1 : 0;
      continue;
    }

    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] !== '\n') continue;
      const attrs = blockAttrsAtNewlineInOp(op, i);
      if (isParagraphSpacingBlock(attrs)) {
        indices.push(pos + i);
      }
    }
    pos += op.insert.length;
  }

  return indices;
}

/**
 * True when Settings paragraph-spacing Apply would set margin attrs on any plain `\n`.
 */
export function settingsParagraphSpacingPreviewWouldPatchDelta(
  delta: Delta,
  afterEm: number,
  beforeEm = 0,
): boolean {
  if (!(afterEm >= 0) || !Number.isFinite(afterEm)) return false;
  if (!(beforeEm >= 0) || !Number.isFinite(beforeEm)) return false;

  for (const nlIndex of listParagraphSpacingBlockNewlineIndices(delta)) {
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
    const currentAfter = attrs[SCRIDER_MARGIN_AFTER_KEY];
    const currentBefore = attrs[SCRIDER_MARGIN_BEFORE_KEY];
    if (!marginEmMatchesTarget(currentAfter, afterEm)) {
      return true;
    }
    if (!marginEmMatchesTarget(currentBefore, beforeEm)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply document paragraph spacing to every plain paragraph
 * (`scrider-margin-before` / `scrider-margin-after` on `\n`).
 */
export function applySettingsParagraphSpacingToDelta(
  delta: Delta,
  afterEm: number,
  beforeEm = 0,
): ApplySettingsParagraphSpacingResult {
  if (!(afterEm >= 0) || !Number.isFinite(afterEm)) {
    return { delta, patchedCount: 0 };
  }
  if (!(beforeEm >= 0) || !Number.isFinite(beforeEm)) {
    return { delta, patchedCount: 0 };
  }

  const targetAfter = formatParagraphSpacingDeltaValue(afterEm);
  const targetBefore = formatParagraphSpacingDeltaValue(beforeEm);
  const patches = new Map<number, AttributeMap>();

  for (const nlIndex of listParagraphSpacingBlockNewlineIndices(delta)) {
    const attrs = blockAttrsAtDeltaIndex(delta, nlIndex);
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
