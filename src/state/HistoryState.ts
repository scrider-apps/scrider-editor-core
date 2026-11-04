import { compose } from '@scrider/delta';
import type { Delta } from '@scrider/delta';
import type { ScriderDocumentMetadata } from '@scrider/formatter';

import type { SelectionRange } from './SelectionRange';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface HistoryConfig {
  /** Maximum number of entries in the undo stack. Oldest entries are trimmed. */
  readonly maxStackSize: number;
  /** Time window (ms) for merging consecutive operations into a single undo step. */
  readonly mergeDelay: number;
  /** Maximum operations that can be merged into a single undo step. */
  readonly maxConsecutive: number;
}

export const defaultHistoryConfig: HistoryConfig = {
  maxStackSize: 100,
  mergeDelay: 500,
  maxConsecutive: 20,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  /** Inverse Delta — applying it to the current document reverts the change. */
  readonly changeDelta: Delta;
  /** Cursor position before the change (restored on undo). */
  readonly selection: SelectionRange | null;
  /**
   * Document metadata to restore when this entry is applied (undo/redo).
   *
   * - `undefined` — this entry does not affect document metadata; leave it as-is.
   * - a value (object or `null`) — set `scriderMetadata` to it when applied.
   *
   * Unlike `changeDelta` (a reversible OT delta), metadata is restored by full
   * value swap, so the entry stores the value to apply on this direction.
   */
  readonly metadata?: ScriderDocumentMetadata | null;
}

export interface HistoryState {
  readonly undoStack: readonly HistoryEntry[];
  readonly redoStack: readonly HistoryEntry[];
  /** Timestamp (ms) of the last pushUndo call. Used for merge logic. */
  readonly lastRecordedAt: number;
  /** Number of consecutively merged operations in the current group. */
  readonly consecutiveCount: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHistoryState(): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
    lastRecordedAt: 0,
    consecutiveCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Mutations (immutable — return new objects)
// ---------------------------------------------------------------------------

/**
 * Push an inverse Delta onto the undo stack.
 *
 * Merging logic: if the previous push happened within `config.mergeDelay` ms
 * and the consecutive count is below `config.maxConsecutive`, the new inverse
 * is composed with the top entry instead of creating a new one.
 *
 * Clears the redo stack (any new edit invalidates the redo chain).
 *
 * @param history   Current history state
 * @param inverseDelta  The inverse of the applied change (computed via `invert(change, base)`)
 * @param selection     Cursor position *before* the change
 * @param config        History configuration (limits, merge delay)
 * @param now           Current timestamp in ms (injectable for deterministic tests)
 */
export function pushUndo(
  history: HistoryState,
  inverseDelta: Delta,
  selection: SelectionRange | null,
  config: HistoryConfig,
  now?: number,
): HistoryState {
  const timestamp = now ?? Date.now();
  const timeSinceLast = timestamp - history.lastRecordedAt;

  const shouldMerge =
    history.undoStack.length > 0 &&
    timeSinceLast < config.mergeDelay &&
    history.consecutiveCount < config.maxConsecutive &&
    // Never merge a delta edit onto a metadata-carrying entry: metadata is
    // restored by full value swap and would be lost by the delta-only merge.
    history.undoStack[history.undoStack.length - 1]!.metadata === undefined;

  let newUndoStack: HistoryEntry[];

  if (shouldMerge) {
    const lastEntry = history.undoStack[history.undoStack.length - 1]!;
    // compose(new_inverse, existing_inverse) → combined inverse (D_n → D_0)
    const mergedDelta = compose(inverseDelta, lastEntry.changeDelta);
    const mergedEntry: HistoryEntry = {
      changeDelta: mergedDelta,
      selection: lastEntry.selection, // keep the earliest selection in the group
    };
    newUndoStack = [...history.undoStack.slice(0, -1), mergedEntry];
  } else {
    newUndoStack = [...history.undoStack, { changeDelta: inverseDelta, selection }];
  }

  // Trim oldest entries if stack exceeds max size
  if (newUndoStack.length > config.maxStackSize) {
    newUndoStack = newUndoStack.slice(newUndoStack.length - config.maxStackSize);
  }

  return {
    undoStack: newUndoStack,
    redoStack: [],
    lastRecordedAt: timestamp,
    consecutiveCount: shouldMerge ? history.consecutiveCount + 1 : 1,
  };
}

/**
 * Push a full {@link HistoryEntry} onto the undo stack WITHOUT delta-merge.
 *
 * Used for discrete, non-mergeable changes (e.g. document metadata via
 * `setDocumentMetadata`) that must remain their own undo step. Clears the redo
 * stack, trims to `maxStackSize`, and resets the merge group.
 */
export function pushUndoSnapshot(
  history: HistoryState,
  entry: HistoryEntry,
  config: HistoryConfig,
  now?: number,
): HistoryState {
  const timestamp = now ?? Date.now();

  let newUndoStack: HistoryEntry[] = [...history.undoStack, entry];
  if (newUndoStack.length > config.maxStackSize) {
    newUndoStack = newUndoStack.slice(newUndoStack.length - config.maxStackSize);
  }

  return {
    undoStack: newUndoStack,
    redoStack: [],
    lastRecordedAt: timestamp,
    consecutiveCount: 0,
  };
}

/**
 * Pop the most recent entry from the undo stack.
 * Returns null if the stack is empty.
 */
export function popUndo(
  history: HistoryState,
): { entry: HistoryEntry; history: HistoryState } | null {
  if (history.undoStack.length === 0) return null;

  const entry = history.undoStack[history.undoStack.length - 1]!;
  return {
    entry,
    history: {
      ...history,
      undoStack: history.undoStack.slice(0, -1),
      consecutiveCount: 0,
    },
  };
}

/**
 * Pop the most recent entry from the redo stack.
 * Returns null if the stack is empty.
 */
export function popRedo(
  history: HistoryState,
): { entry: HistoryEntry; history: HistoryState } | null {
  if (history.redoStack.length === 0) return null;

  const entry = history.redoStack[history.redoStack.length - 1]!;
  return {
    entry,
    history: {
      ...history,
      redoStack: history.redoStack.slice(0, -1),
      consecutiveCount: 0,
    },
  };
}

/**
 * Push an inverse Delta onto the redo stack.
 * Used by the `undo` command to record the reverse operation.
 *
 * `metadata` mirrors {@link HistoryEntry.metadata}: pass `undefined` when the
 * change did not affect document metadata, or the value to restore on redo.
 */
export function pushRedo(
  history: HistoryState,
  inverseDelta: Delta,
  selection: SelectionRange | null,
  metadata?: ScriderDocumentMetadata | null,
): HistoryState {
  const entry: HistoryEntry = {
    changeDelta: inverseDelta,
    selection,
    ...(metadata !== undefined ? { metadata } : {}),
  };
  return {
    ...history,
    redoStack: [...history.redoStack, entry],
    consecutiveCount: 0,
  };
}
