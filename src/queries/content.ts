import { isTextInsert } from '@scrider/delta';
import type { Delta } from '@scrider/delta';

import type { EditorState } from '../state/EditorState';

/**
 * Get the plain text content of the document.
 * Only text inserts are included; embeds are skipped.
 */
export function getPlainText(state: EditorState): string {
  let text = '';
  for (const op of state.delta.ops) {
    if (isTextInsert(op)) {
      text += op.insert;
    }
  }
  return text;
}

/**
 * Get the total length of the document (text characters + embeds).
 * Uses `Delta.length()` which counts every insert.
 */
export function getLength(state: EditorState): number {
  return state.delta.length();
}

/**
 * Get a Delta slice of the document.
 *
 * - No arguments: returns the full document delta.
 * - `index` only: returns from index to the end.
 * - `index` + `length`: returns the specified range.
 */
export function getContents(state: EditorState, index?: number, length?: number): Delta {
  if (index == null) return state.delta;
  if (length == null) return state.delta.slice(index);
  return state.delta.slice(index, index + length);
}
