import { Delta, compose, diff, isTextInsert } from '@scrider/delta';

/**
 * Quill invariant: a document is never empty — it is at least `[{ insert: '\n' }]`.
 * Paste / delete of a whole selection can strip that terminator.
 */
export function ensureDocumentTrailingNewline(delta: Delta): Delta {
  const ops = delta.ops;
  if (ops.length === 0) return new Delta().insert('\n');
  const last = ops[ops.length - 1]!;
  if (isTextInsert(last) && last.insert.endsWith('\n')) return delta;
  return delta.concat(new Delta([{ insert: '\n' }]));
}

/**
 * Apply a change, then restore the trailing-`\n` invariant **inside** the same
 * change so undo does not leave a leftover skeleton line (Ctrl+A → Delete → Undo).
 */
export function composeKeepingDocumentNewline(
  delta: Delta,
  change: Delta,
): { newDelta: Delta; change: Delta } {
  const composed = compose(delta, change);
  const newDelta = ensureDocumentTrailingNewline(composed);
  if (newDelta === composed) return { newDelta, change };
  return { newDelta, change: diff(delta, newDelta) };
}
