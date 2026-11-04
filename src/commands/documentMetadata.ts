import { Delta, serializeDocument } from '@scrider/delta';
import type { ScriderDocument } from '@scrider/delta';
import type { ScriderDocumentMetadata } from '@scrider/formatter';

import type { EditorState } from '../state/EditorState';
import { pushUndoSnapshot } from '../state/HistoryState';

/**
 * Loosely-typed metadata input accepted by the commands: any known key may be
 * omitted or explicitly set to `undefined`/`null` (both are treated as "unset"
 * and dropped by {@link normalizeDocumentMetadata}). Hosts often build metadata
 * as `{ lineSpacing: settings.lineSpacing ?? undefined }`, so the input is
 * deliberately more permissive than the persisted {@link ScriderDocumentMetadata}.
 */
export type DocumentMetadataInput = {
  [K in keyof ScriderDocumentMetadata]?: ScriderDocumentMetadata[K] | null | undefined;
};

/**
 * Options common to document-metadata commands.
 */
export interface SetDocumentMetadataOptions {
  /** Current timestamp (ms) for the history entry (injectable for tests). */
  now?: number;
}

/**
 * Normalize document metadata to its canonical persisted form:
 * drop keys whose value is `undefined` or `null`, and collapse an empty result
 * to `null` (so serialization omits `scrider-metadata` entirely).
 *
 * `false` and `0` are preserved (they are meaningful values, not "unset").
 */
export function normalizeDocumentMetadata(
  metadata: DocumentMetadataInput | null | undefined,
): ScriderDocumentMetadata | null {
  if (metadata == null) return null;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Shallow value equality for normalized document metadata (fields are primitives).
 * `null` compares equal only to `null`.
 */
export function documentMetadataEquals(
  a: ScriderDocumentMetadata | null,
  b: ScriderDocumentMetadata | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;

  const aRecord: Record<string, unknown> = { ...a };
  const bRecord: Record<string, unknown> = { ...b };
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bRecord, key)) return false;
    if (aRecord[key] !== bRecord[key]) return false;
  }
  return true;
}

/**
 * Replace the document-level metadata (`scrider-metadata`).
 *
 * The new metadata is normalized; when it equals the current metadata the state
 * is returned unchanged (no history entry). Otherwise the change is recorded as a
 * single, non-mergeable undo step (atomically with the document — see
 * `HistoryEntry.metadata`). The op-stream (`delta`) is not touched.
 */
export function setDocumentMetadata(
  state: EditorState,
  metadata: DocumentMetadataInput | null,
  options?: SetDocumentMetadataOptions,
): EditorState {
  const next = normalizeDocumentMetadata(metadata);
  if (documentMetadataEquals(next, state.scriderMetadata)) {
    return state;
  }

  const history = pushUndoSnapshot(
    state.history,
    {
      // Metadata-only change: empty op-stream delta, metadata restored on undo.
      changeDelta: new Delta(),
      selection: state.selection,
      metadata: state.scriderMetadata,
    },
    state.config.history,
    options?.now,
  );

  return {
    ...state,
    scriderMetadata: next,
    history,
  };
}

/**
 * Merge a partial patch into the current document metadata.
 *
 * Keys set to `undefined` or `null` in the patch are removed; other keys are
 * overwritten. Delegates to {@link setDocumentMetadata} (same undo semantics).
 */
export function updateDocumentMetadata(
  state: EditorState,
  patch: DocumentMetadataInput,
  options?: SetDocumentMetadataOptions,
): EditorState {
  const merged: Record<string, unknown> = { ...state.scriderMetadata };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return setDocumentMetadata(state, merged, options);
}

/**
 * Serialize an editor state to a persisted `ScriderDocument` (`{ ops, scrider-metadata }`).
 * Metadata is deep-cloned and omitted when empty (see `serializeDocument`).
 */
export function editorStateToScriderDocument(state: EditorState): ScriderDocument {
  let metadata: Record<string, unknown> | undefined;
  if (state.scriderMetadata) {
    metadata = { ...state.scriderMetadata };
  }
  return serializeDocument(state.delta, metadata);
}

/**
 * Normalize a parsed metadata record (from `parseDocument`) into
 * `ScriderDocumentMetadata | null` for use in `createEditorState`.
 */
export function documentMetadataFromRecord(
  record: Record<string, unknown> | undefined | null,
): ScriderDocumentMetadata | null {
  return normalizeDocumentMetadata(record ?? null);
}
