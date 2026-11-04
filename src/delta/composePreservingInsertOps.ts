import { Delta, isInsert, type Op } from '@scrider/delta';

/**
 * Build a change Delta from retain/delete + insert ops without merging inserts.
 */
export function buildInsertChange(index: number, deleteLength: number, insertOps: Op[]): Delta {
  let change = new Delta().retain(index);
  if (deleteLength > 0) {
    change = change.delete(deleteLength);
  }
  if (insertOps.length === 0) return change;
  return change.concat(new Delta(insertOps));
}

/**
 * Apply a change while preserving boundaries between consecutive insert ops.
 * Standard `compose` merges adjacent text inserts with identical attributes.
 */
export function composePreservingInsertOps(base: Delta, change: Delta): Delta {
  let index = 0;
  let deleteLength = 0;
  const insertOps: Op[] = [];

  for (const op of change.ops) {
    if ('retain' in op && op.retain != null) {
      index += op.retain;
    } else if ('delete' in op && op.delete != null) {
      deleteLength += op.delete;
    } else if (isInsert(op)) {
      insertOps.push(op);
    }
  }

  const before = base.slice(0, index);
  const after = base.slice(index + deleteLength);
  if (insertOps.length === 0) {
    return before.concat(after);
  }
  return before.concat(new Delta(insertOps)).concat(after);
}
