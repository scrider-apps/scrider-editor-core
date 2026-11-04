import { isTextInsert, isInsert } from '@scrider/delta';
import type { AttributeMap, Delta } from '@scrider/delta';

import { blockAttrsAtNewlineInOp, inlineAttrsOnly } from '../../delta/newlineBlockAttributes';

import { BACKSPACE_DEDENT_KEYS } from './constants';

interface LineNewline {
  newlineIndex: number;
  attributes: AttributeMap;
}

/**
 * Find the `\n` that terminates the line containing `cursorIndex`.
 * Scans character-by-character to handle merged text ops.
 */
export function findCurrentLineNewline(delta: Delta, cursorIndex: number): LineNewline | null {
  let pos = 0;

  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (op.insert[i] === '\n' && pos + i >= cursorIndex) {
          return {
            newlineIndex: pos + i,
            attributes: blockAttrsAtNewlineInOp(op, i),
          };
        }
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      pos += 1;
    }
  }

  return null;
}

/**
 * True if `index` is at the very start of a line (position 0 or right after `\n`).
 * Works for standalone `\n` ops and for `\n` embedded in a text op (pre-split paste).
 */
export function isAtLineStart(delta: Delta, index: number): boolean {
  if (index === 0) return true;
  const prev = delta.slice(index - 1, index);
  const op = prev.ops[0];
  return op != null && isTextInsert(op) && op.insert.length === 1 && op.insert[0] === '\n';
}

/**
 * True if the attribute map has any block-level formatting.
 */
export function hasBackspaceDedents(attrs: AttributeMap): boolean {
  return BACKSPACE_DEDENT_KEYS.some((key) => attrs[key] != null);
}

/**
 * Get inline attributes from around `index`, used to inherit formatting
 * when typing without `storedMarks`.
 *
 * Resolution order (mirrors `queries/formats.ts:getInlineFormatsAtCaret`
 * so that what the toolbar shows is what the next character actually gets):
 *
 *   1. Character immediately before the caret (same-line text).
 *   2. Character immediately after the caret (first char of current line).
 *   3. **Empty-line case (both neighbours are `\n`)**: read inline marks
 *      that may be persisted on the trailing `\n` op itself (paste from
 *      Word / Google Docs commonly stores font/size there).
 *   4. **Deep scan backwards** past one or more `\n` ops, looking for the
 *      nearest text op with attrs, OR a `\n` carrying inline marks.
 *
 * Without steps 3-4 a caret on a blank line surrounded by formatted
 * paragraphs would silently fall back to the default font/size when the
 * user types — even though the toolbar correctly reports the inherited
 * formatting. The two functions are kept in lockstep on purpose.
 */
export function getInheritedAttrs(delta: Delta, index: number): AttributeMap {
  if (index > 0) {
    const prev = delta.slice(index - 1, index);
    const op = prev.ops[0];
    if (op && isTextInsert(op) && op.insert !== '\n') {
      return op.attributes ? { ...op.attributes } : {};
    }
  }

  const after = delta.slice(index, index + 1);
  const afterOp = after.ops[0];
  if (afterOp && isTextInsert(afterOp)) {
    if (afterOp.insert !== '\n') {
      return afterOp.attributes ? { ...afterOp.attributes } : {};
    }
    if (afterOp.attributes) {
      const inline = inlineAttrsOnly(afterOp.attributes);
      if (Object.keys(inline).length > 0) return inline;
    }
  }

  for (let i = index > 0 ? index - 1 : 0; i > 0; i--) {
    const slice = delta.slice(i - 1, i);
    const op = slice.ops[0];
    if (!op || !isTextInsert(op)) break;
    if (op.insert !== '\n') {
      return op.attributes ? { ...op.attributes } : {};
    }
    if (op.attributes) {
      const inline = inlineAttrsOnly(op.attributes);
      if (Object.keys(inline).length > 0) return inline;
    }
  }

  return {};
}

/**
 * Get the intersection of inline attributes across a non-empty selection.
 *
 * Used when typing over a selection — the new text should inherit the
 * formatting uniformly applied to the replaced range (font, size, bold,
 * color, …).  Without this, Ctrl+A → setFont('TNR') → type would lose the
 * font because `getInheritedAttrs` only looks at the single char before
 * the cursor, which may not represent the selection's formatting.
 *
 * Skips `\n` ops so block-level attrs (header, list, …) don't leak into
 * the inline insert.
 */
export function getSelectionInlineIntersection(
  delta: Delta,
  index: number,
  length: number,
): AttributeMap {
  if (length <= 0) return {};

  const slice = delta.slice(index, index + length);
  type TextOp = { insert: string; attributes?: AttributeMap };
  const textOps = slice.ops.filter((op): op is TextOp => isTextInsert(op) && op.insert !== '\n');
  if (textOps.length === 0) return {};

  let result: AttributeMap = { ...(textOps[0]!.attributes ?? {}) };

  for (let i = 1; i < textOps.length; i++) {
    const attrs = textOps[i]!.attributes ?? {};
    const next: AttributeMap = {};
    for (const [key, value] of Object.entries(result)) {
      if (key in attrs && attrs[key] === value) {
        next[key] = value;
      }
    }
    result = next;
    if (Object.keys(result).length === 0) break;
  }

  return result;
}

function deltaCharAt(delta: Delta, index: number): string | null {
  let pos = 0;
  for (const op of delta.ops) {
    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (pos + i === index) return op.insert[i]!;
        if (pos + i > index) return null;
      }
      pos += op.insert.length;
    } else if (isInsert(op)) {
      if (pos === index) return null;
      pos += 1;
    }
  }
  return null;
}

/** True when `insertIndex` starts a document line (paste/toolbar block on its own row). */
export function blockInsertStartsNewLine(delta: Delta, insertIndex: number): boolean {
  if (insertIndex <= 0) return true;
  return deltaCharAt(delta, insertIndex - 1) === '\n';
}
