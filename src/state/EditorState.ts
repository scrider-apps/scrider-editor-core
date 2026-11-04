import { Delta } from '@scrider/delta';
import type { AttributeMap } from '@scrider/delta';
import { createDefaultRegistry } from '@scrider/formatter';
import type { Registry, ScriderDocumentMetadata } from '@scrider/formatter';

import type { EditorBehavior } from '../behavior/types';
import type { SelectionRange } from './SelectionRange';
import type { HistoryState, HistoryConfig } from './HistoryState';
import { createHistoryState, defaultHistoryConfig } from './HistoryState';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EditorConfig {
  readonly history: HistoryConfig;
  /** Extension hooks consulted by structural commands, in order. */
  readonly behaviors: readonly EditorBehavior[];
}

export const defaultEditorConfig: EditorConfig = {
  history: defaultHistoryConfig,
  behaviors: [],
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface EditorState {
  /** Current document content. */
  readonly delta: Delta;
  /** Current cursor position / selection. null = no focus. */
  readonly selection: SelectionRange | null;
  /** Undo / redo stacks. */
  readonly history: HistoryState;
  /** Format registry from @scrider/formatter. */
  readonly registry: Registry;
  /** Editor configuration (history limits, etc.). */
  readonly config: EditorConfig;
  /**
   * Pending inline formats to apply on the next `insertText`.
   * Set by toggle commands when selection.length === 0 (caret mode).
   * Reset to null on cursor movement or after text insertion.
   */
  readonly storedMarks: AttributeMap | null;
  /**
   * Document-level metadata (`scrider-metadata`): document-wide defaults such as
   * line spacing, paragraph spacing, indent, and heading/font policy. `null` when
   * the document carries no document-level metadata.
   *
   * Stored ONCE per document instead of duplicating defaults as block attributes
   * on every `\n`. Included in undo/redo snapshots (atomically with `delta`).
   * Serialized as the `scrider-metadata` sibling of `ops` (see `serializeDocument`
   * / `parseDocument` in `@scrider/delta`).
   */
  readonly scriderMetadata: ScriderDocumentMetadata | null;
  /**
   * Monotonic document generation.
   * Increments when `delta` or `scriderMetadata` identity changes; selection /
   * storedMarks / history stack churn do not. Pull consumers poll
   * `getRevision()` (O(1)) and materialize via `getDocument()` only on change.
   */
  readonly revision: number;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface CreateEditorStateOptions {
  /** Initial document. Defaults to empty document (`[{ insert: '\\n' }]`). */
  readonly delta?: Delta;
  /** Initial cursor position. Defaults to null. */
  readonly selection?: SelectionRange;
  /** Custom format registry. Defaults to `createDefaultRegistry()`. */
  readonly registry?: Registry;
  /** Initial document-level metadata. Defaults to `null` (no metadata). */
  readonly scriderMetadata?: ScriderDocumentMetadata | null;
  /** Partial config — missing fields use defaults. */
  readonly config?: {
    readonly history?: {
      readonly maxStackSize?: number;
      readonly mergeDelay?: number;
      readonly maxConsecutive?: number;
    };
    readonly behaviors?: readonly EditorBehavior[];
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new EditorState with sensible defaults.
 *
 * An empty document in Delta convention is `[{ insert: '\\n' }]`
 * (every document ends with a newline).
 */
export function createEditorState(options?: CreateEditorStateOptions): EditorState {
  const historyInput = options?.config?.history;
  const historyConfig: HistoryConfig = {
    maxStackSize: historyInput?.maxStackSize ?? defaultHistoryConfig.maxStackSize,
    mergeDelay: historyInput?.mergeDelay ?? defaultHistoryConfig.mergeDelay,
    maxConsecutive: historyInput?.maxConsecutive ?? defaultHistoryConfig.maxConsecutive,
  };

  const config: EditorConfig = {
    history: historyConfig,
    behaviors: options?.config?.behaviors ?? [],
  };

  return {
    delta: options?.delta ?? new Delta().insert('\n'),
    selection: options?.selection ?? null,
    history: createHistoryState(),
    registry: options?.registry ?? createDefaultRegistry(),
    config,
    storedMarks: null,
    scriderMetadata: options?.scriderMetadata ?? null,
    revision: 0,
  };
}

/**
 * Apply a state transition with a monotonic document {@link EditorState.revision}.
 * Bumps when `delta` or `scriderMetadata` reference changes; otherwise clamps
 * revision to `prev` (selection-only / marks-only updates).
 */
export function applyEditorStateTransition(prev: EditorState, next: EditorState): EditorState {
  const docChanged = next.delta !== prev.delta || next.scriderMetadata !== prev.scriderMetadata;
  if (docChanged) {
    return next.revision === prev.revision + 1 ? next : { ...next, revision: prev.revision + 1 };
  }
  return next.revision === prev.revision ? next : { ...next, revision: prev.revision };
}
