import type { AttributeMap, Delta } from '@scrider/delta';
import { isInsert, isTextInsert } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtDeltaIndex,
  blockAttrsAtNewlineInOp,
} from '../delta/newlineBlockAttributes';

export const SCRIDER_LINE_HEIGHT_KEY = 'scrider-line-height';

export interface ApplySettingsLineSpacingResult {
  delta: Delta;
  patchedCount: number;
}

/** `p`, `li`, `blockquote` — not headings, code-block, or table rows. */
export function isLineSpacingBlock(attrs: AttributeMap): boolean {
  if (attrs.header != null) return false;
  if (attrs['code-block'] != null) return false;
  if (attrs['table-row'] != null) return false;
  return true;
}

export function formatLineSpacingDeltaValue(multiplier: number): string {
  const s = String(multiplier);
  return s;
}

/** Every `\n` that terminates a line eligible for document line spacing. */
export function listLineSpacingBlockNewlineIndices(delta: Delta): number[] {
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
      if (isLineSpacingBlock(attrs)) {
        indices.push(pos + i);
      }
    }
    pos += op.insert.length;
  }

  return indices;
}

/**
 * True when Settings line-spacing Apply would set `scrider-line-height` on any eligible `\n`.
 */
export function settingsLineSpacingPreviewWouldPatchDelta(
  delta: Delta,
  multiplier: number,
): boolean {
  if (!(multiplier > 0)) return false;

  const target = formatLineSpacingDeltaValue(multiplier);
  for (const nlIndex of listLineSpacingBlockNewlineIndices(delta)) {
    const current = blockAttrsAtDeltaIndex(delta, nlIndex)[SCRIDER_LINE_HEIGHT_KEY];
    if (typeof current !== 'string' || current !== target) {
      return true;
    }
  }
  return false;
}

/**
 * Apply document line spacing to every eligible block line (`scrider-line-height` on `\n`).
 */
export function applySettingsLineSpacingToDelta(
  delta: Delta,
  multiplier: number,
): ApplySettingsLineSpacingResult {
  if (!(multiplier > 0)) {
    return { delta, patchedCount: 0 };
  }

  const target = formatLineSpacingDeltaValue(multiplier);
  const patches = new Map<number, AttributeMap>();

  for (const nlIndex of listLineSpacingBlockNewlineIndices(delta)) {
    const current = blockAttrsAtDeltaIndex(delta, nlIndex)[SCRIDER_LINE_HEIGHT_KEY];
    if (current === target) continue;
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
