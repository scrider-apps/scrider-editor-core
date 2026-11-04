import { isTextInsert, isInsert } from '@scrider/delta';
import type { Delta, AttributeMap, Op } from '@scrider/delta';

import { blockAttrsAtNewlineInOp, inlineAttrsOnly } from '../delta/newlineBlockAttributes';
import type { EditorState } from '../state/EditorState';
import type { SelectionRange } from '../state/SelectionRange';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the intersection of attributes across all non-newline text ops.
 * Returns only those attributes shared by every text op in the list.
 */
function getInlineIntersection(ops: Op[]): AttributeMap {
  const textOps = ops.filter(
    (op): op is Op & { insert: string; attributes?: AttributeMap } =>
      isTextInsert(op) && op.insert !== '\n',
  );

  if (textOps.length === 0) return {};

  const first = textOps[0]!;
  let result: AttributeMap = { ...(first.attributes ?? {}) };

  for (let i = 1; i < textOps.length; i++) {
    const attrs = textOps[i]!.attributes ?? {};
    const next: AttributeMap = {};
    for (const [key, value] of Object.entries(result)) {
      if (key in attrs && attrs[key] === value) {
        next[key] = value;
      }
    }
    result = next;
  }

  return result;
}

/**
 * Find the block (line-level) attributes at a given position.
 * Scans forward from `index` to find the first `\n` character and returns
 * the attributes of the op that contains it.
 *
 * Handles merged text ops (e.g. `{insert: "\n\n", attributes: {list: "bullet"}}`)
 * by scanning character-by-character within each text op.
 */
function getBlockFormatsAtPosition(delta: Delta, index: number): AttributeMap {
  let pos = 0;

  for (const op of delta.ops) {
    if (!isInsert(op)) continue;

    if (isTextInsert(op)) {
      for (let i = 0; i < op.insert.length; i++) {
        if (pos + i >= index && op.insert[i] === '\n') {
          return blockAttrsAtNewlineInOp(op, i);
        }
      }
      pos += op.insert.length;
    } else {
      pos += 1; // embed
    }
  }

  return {};
}

/**
 * Get inline attributes at a caret position.
 * Prefers the character before the caret; when that is unavailable (position 0)
 * or a newline (start of line), falls back to the character after the caret.
 * On empty lines (both neighbors are \n), extracts inline attrs from the \n op
 * itself (font/size may be stored there from paste or formatting).
 */
function getInlineFormatsAtCaret(delta: Delta, index: number): AttributeMap {
  // 1. Immediate neighbour before caret (same-line text)
  if (index > 0) {
    const before = delta.slice(index - 1, index);
    const op = before.ops[0];
    if (op != null && isTextInsert(op) && op.insert !== '\n') {
      return op.attributes ? { ...op.attributes } : {};
    }
  }

  // 2. Immediate neighbour after caret (first char of current line)
  const after = delta.slice(index, index + 1);
  const afterOp = after.ops[0];
  if (afterOp != null && isTextInsert(afterOp)) {
    if (afterOp.insert !== '\n') {
      return afterOp.attributes ? { ...afterOp.attributes } : {};
    }
    // Empty line: \n may carry inline attrs (font/size from paste)
    if (afterOp.attributes) {
      const inline = inlineAttrsOnly(afterOp.attributes);
      if (Object.keys(inline).length > 0) return inline;
    }
  }

  // 3. Deep scan backwards past \n (for undo landing on empty trailing lines)
  for (let i = index > 0 ? index - 1 : 0; i > 0; i--) {
    const before = delta.slice(i - 1, i);
    const op = before.ops[0];
    if (op == null) break;
    if (isTextInsert(op) && op.insert !== '\n') {
      return op.attributes ? { ...op.attributes } : {};
    }
    if (isTextInsert(op) && op.insert === '\n' && op.attributes) {
      const inline = inlineAttrsOnly(op.attributes);
      if (Object.keys(inline).length > 0) return inline;
    }
  }

  return {};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all active formats at the current cursor position / selection.
 *
 * - Caret (length=0): inline attrs from char before caret + block attrs of current line + storedMarks
 * - Selection (length>0): intersection of inline attrs + intersection of block attrs + storedMarks
 * - No selection: empty object
 *
 * storedMarks override inferred formats. A `null` value in storedMarks removes a format.
 */
export function getActiveFormats(state: EditorState): AttributeMap {
  const { delta, selection, storedMarks } = state;
  if (!selection) return {};

  let formats: AttributeMap;

  if (selection.length === 0) {
    const inlineFormats = getInlineFormatsAtCaret(delta, selection.index);
    const blockFormats = getBlockFormatsAtPosition(delta, selection.index);
    formats = { ...blockFormats, ...inlineFormats };
  } else {
    const slice = delta.slice(selection.index, selection.index + selection.length);
    const inlineFormats = getInlineIntersection(slice.ops);

    // Block formats: intersection of attributes on \n ops in the range.
    // When the selection sits inside a single line (no \n captured),
    // fall back to the block format of the line containing the selection.
    const newlineOps = slice.ops.filter(
      (op): op is Op & { insert: string; attributes?: AttributeMap } =>
        isTextInsert(op) && op.insert === '\n',
    );
    const blockFormats =
      newlineOps.length > 0
        ? newlineOps.reduce<AttributeMap>((acc, op) => {
            if (Object.keys(acc).length === 0 && newlineOps.indexOf(op) === 0) {
              return { ...(op.attributes ?? {}) };
            }
            const attrs = op.attributes ?? {};
            const next: AttributeMap = {};
            for (const [key, value] of Object.entries(acc)) {
              if (key in attrs && attrs[key] === value) {
                next[key] = value;
              }
            }
            return next;
          }, {})
        : getBlockFormatsAtPosition(delta, selection.index);

    formats = { ...blockFormats, ...inlineFormats };
  }

  // Apply storedMarks: overrides inferred formats, null removes
  if (storedMarks) {
    formats = { ...formats };
    for (const [key, value] of Object.entries(storedMarks)) {
      if (value === null || value === undefined) {
        delete (formats as Record<string, unknown>)[key];
      } else {
        (formats as Record<string, unknown>)[key] = value;
      }
    }
  }

  return formats;
}

/**
 * Check if a specific inline format is active across the entire selection.
 *
 * - Caret (length=0): checks the character before the caret.
 * - Selection (length>0): returns true only if ALL non-newline text ops have the format.
 *
 * Does NOT consider storedMarks — commands should check storedMarks separately.
 */
export function isFormatActive(delta: Delta, selection: SelectionRange, format: string): boolean {
  if (selection.length === 0) {
    const attrs = getInlineFormatsAtCaret(delta, selection.index);
    return attrs[format] != null;
  }

  const slice = delta.slice(selection.index, selection.index + selection.length);
  let foundText = false;

  for (const op of slice.ops) {
    if (isTextInsert(op) && op.insert !== '\n') {
      foundText = true;
      if (op.attributes == null || op.attributes[format] == null) {
        return false;
      }
    }
  }

  return foundText;
}

/**
 * Get the link URL if any character in the selection has a link (first value found).
 * Use this when getActiveFormats().link is empty due to intersection (e.g. selection
 * spans list marker + linked text). Returns undefined if no link in range.
 */
export function getLinkInSelection(state: EditorState): string | undefined {
  const { delta, selection } = state;
  if (!selection || selection.length === 0) return undefined;

  const slice = delta.slice(selection.index, selection.index + selection.length);
  for (const op of slice.ops) {
    if (isTextInsert(op) && op.insert !== '\n' && op.attributes?.link != null) {
      const link = op.attributes.link;
      if (typeof link === 'string') return link;
    }
  }
  return undefined;
}
