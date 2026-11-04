import { Delta, diff, invert, isTextInsert, type Op } from '@scrider/delta';
import {
  deltaToHtml,
  htmlToDelta,
  type DeltaToHtmlOptions,
  type DocumentPresentation,
  type ScriderDocumentMetadata,
  type TablePresentation,
} from '@scrider/formatter';

import { blockAttrsOnly } from '../delta/newlineBlockAttributes';
import {
  adjustPasteInsertIndex,
  canonicalizePasteDeltaRange,
  canonicalizePasteOps,
  ensureSeparatorLineAfterPastedTable,
  pasteCaretIndexInRange,
  pasteOpsContainBlockOwnedEmbed,
  pasteOpsContainTableGrid,
} from '../delta/canonicalizePasteOps';
import { buildInsertChange, composePreservingInsertOps } from '../delta/composePreservingInsertOps';
import {
  composeKeepingDocumentNewline,
  ensureDocumentTrailingNewline,
} from '../delta/ensureDocumentTrailingNewline';
import {
  bakeDocumentSettingsOnPasteDelta,
  resolvePasteBakeEndExclusive,
  type DocumentSettingsPasteBakeOptions,
} from './bakeDocumentSettingsOnPaste';
import type { EditorState } from '../state/EditorState';
import { pushUndo } from '../state/HistoryState';

export type { DocumentPresentation };
export {
  adjustPasteInsertIndex,
  pasteCaretIndexInRange,
  pasteOpsContainBlockOwnedEmbed,
} from '../delta/canonicalizePasteOps';

// ---------------------------------------------------------------------------
// prepareCopy
// ---------------------------------------------------------------------------

export interface PrepareCopyOptions {
  /** Simple Table borders/styles for Office paste (formatter ≥ 1.3.4). */
  tablePresentation?: TablePresentation;
  /** Line spacing / first-line indent for Office paste (formatter ≥ 1.3.5). */
  documentPresentation?: DocumentPresentation;
  /**
   * Full document metadata (formatter ≥ 1.10.2). When set, heading policy and
   * `tablePresentation` inside metadata project on export if options omit them.
   */
  documentMetadata?: ScriderDocumentMetadata;
  /**
   * Share→embed URL transform for `{ codeWidget }` (`@scrider/formatter` ≥ 1.10.4).
   * Host typically passes `@scrider/editor-react`'s `toCodeWidgetEmbedUrl`.
   */
  codeWidgetEmbedUrl?: (url: string) => string;
}

function isBlockTerminatorOp(op: Op): boolean {
  if (!isTextInsert(op) || !op.insert.startsWith('\n') || !op.attributes) return false;
  const attrs = op.attributes;
  return (
    attrs.header != null ||
    attrs.list != null ||
    attrs.blockquote != null ||
    attrs['code-block'] != null ||
    attrs.accordion != null ||
    attrs['accordion-body'] != null
  );
}

/**
 * True when `selection` covers the whole document (Ctrl+A).
 *
 * Nested table cell editors steal the DOM range after select-all; copy/paste
 * must keep this model selection instead of re-reading the collapsed cell.
 */
export function isWholeDocumentSelection(
  delta: { length(): number },
  selection: { index: number; length: number } | null | undefined,
): boolean {
  if (!selection || selection.length <= 0) return false;
  const len = delta.length();
  return len > 0 && selection.index === 0 && selection.length >= len;
}

/**
 * Browser line selection often stops on the last visible character and omits
 * the line's terminating `\n` — where `header`, `list`, and accordion live.
 * Snap exclusive end forward by one when it sits on that terminator.
 */
export function expandSelectionToIncludeBlockTerminator(
  delta: Delta,
  selection: { index: number; length: number },
): { index: number; length: number } {
  if (selection.length <= 0) return selection;
  const end = selection.index + selection.length;
  if (end >= delta.length()) return selection;

  const atEnd = delta.slice(end, end + 1).ops[0];
  if (!atEnd || !isBlockTerminatorOp(atEnd)) return selection;

  if (end > 0) {
    const before = delta.slice(end - 1, end).ops[0];
    if (before && isTextInsert(before) && before.insert.endsWith('\n')) return selection;
  }

  return { index: selection.index, length: selection.length + 1 };
}

/**
 * Prepare data for clipboard copy.
 *
 * Slices the Delta at the current selection and converts to HTML + plain text.
 * Returns empty strings if there is no selection (length = 0).
 */
export function prepareCopy(
  state: EditorState,
  options?: PrepareCopyOptions,
): { html: string; text: string } {
  const { delta } = state;
  const selection =
    state.selection && state.selection.length > 0
      ? expandSelectionToIncludeBlockTerminator(delta, state.selection)
      : state.selection;

  if (!selection || selection.length === 0) {
    return { html: '', text: '' };
  }

  const slice = delta.slice(selection.index, selection.index + selection.length);
  const htmlOptions: DeltaToHtmlOptions = { registry: state.registry };
  if (options?.tablePresentation !== undefined) {
    htmlOptions.tablePresentation = options.tablePresentation;
  }
  if (options?.documentPresentation !== undefined) {
    htmlOptions.documentPresentation = options.documentPresentation;
  }
  if (options?.documentMetadata !== undefined) {
    htmlOptions.documentMetadata = options.documentMetadata;
  }
  if (options?.codeWidgetEmbedUrl !== undefined) {
    htmlOptions.codeWidgetEmbedUrl = options.codeWidgetEmbedUrl;
  }
  const html = deltaToHtml(slice, htmlOptions);

  let text = '';
  for (const op of slice.ops) {
    if (isTextInsert(op)) {
      text += op.insert;
    }
  }

  return { html, text };
}

/** Standalone `\n` op that carries block/table structure — must not be stripped on paste. */
export function isStructuralPasteNewline(op: Op): boolean {
  if (!isTextInsert(op) || op.insert !== '\n' || !op.attributes) return false;
  const attrs = op.attributes;
  if (
    attrs['table-row'] != null ||
    attrs.header != null ||
    attrs.list != null ||
    attrs.blockquote != null ||
    attrs['code-block'] != null
  ) {
    return true;
  }
  // Word paste / toolbar: `scrider-text-indent`, `align`, `scrider-line-height`, `scrider-margin-after` on `\n`.
  return Object.keys(blockAttrsOnly(attrs)).length > 0;
}

/** Shared paste normalization → canonical Quill block structure. */
export function preparePastedOps(rawOps: Op[], options?: HandlePasteOptions): Op[] {
  let ops = [...rawOps];
  if (options?.transformPastedOps) {
    ops = options.transformPastedOps(ops);
  }
  return canonicalizePasteOps(ops);
}

// ---------------------------------------------------------------------------
// handlePaste
// ---------------------------------------------------------------------------

export type { DocumentSettingsPasteBakeOptions };

export interface HandlePasteOptions {
  /** Optional post-process of pasted ops before compose (e.g. Word paragraph styles). */
  transformPastedOps?: (ops: Op[]) => Op[];
  /** Stamp active document Settings onto the pasted range (line spacing, margins, …). */
  documentSettingsPasteBake?: DocumentSettingsPasteBakeOptions;
}

/**
 * Guarantee the delta ends with a paragraph-terminating `\n` (Quill invariant).
 * Appends a plain `\n` only when the last op is a non-`\n`-terminated text op
 * or a (block) embed. Idempotent for well-formed deltas.
 */
function ensureTrailingParagraphNewline(delta: Delta): Delta {
  return ensureDocumentTrailingNewline(delta);
}

function composePastedOps(
  state: EditorState,
  ops: Op[],
  options?: HandlePasteOptions,
): EditorState {
  const { delta, selection, history, config } = state;
  if (!selection || ops.length === 0) return state;

  const pastingBlockOwnedEmbed = pasteOpsContainBlockOwnedEmbed(ops);
  const pastingTableGrid = pasteOpsContainTableGrid(ops);
  const insertIndex =
    selection.length === 0
      ? adjustPasteInsertIndex(delta, selection.index, {
          pastingBlockOwnedEmbed,
          pastingTableGrid,
        })
      : selection.index;
  const change = buildInsertChange(insertIndex, selection.length, ops);
  const trimmedPasted = new Delta(ops);
  const insertedLength = trimmedPasted.length();
  let newDelta = composePreservingInsertOps(delta, change);

  // Canonicalize the pasted range FIRST, then bake document settings.
  //
  // Order matters: canonicalize collapses Busuu-style "spacer" paragraphs and
  // rewrites presentation-only `\n` ops to plain paragraph breaks (dropping
  // their attributes). The baked document settings (`scrider-line-height`,
  // `scrider-margin-*`) live on those very `\n` ops and are indistinguishable
  // from spacer attributes, so baking before canonicalize lets the collapse
  // step strip the freshly-stamped settings from regular text paragraphs.
  // Baking AFTER canonicalize stamps settings onto the final, normalized
  // paragraphs; the bake only adds attributes (op count / char length are
  // unchanged), so no further canonicalization is required.
  const beforeCanonLength = newDelta.length();
  newDelta = canonicalizePasteDeltaRange(newDelta, insertIndex, insertIndex + insertedLength);
  // canonicalize only rewrites ops inside the pasted range, so the inserted
  // length shifts by the total length delta.
  const canonInsertedLength = insertedLength + (newDelta.length() - beforeCanonLength);

  let pasteRangeEnd = insertIndex + canonInsertedLength;
  if (options?.documentSettingsPasteBake && canonInsertedLength > 0) {
    newDelta = bakeDocumentSettingsOnPasteDelta(
      newDelta,
      insertIndex,
      canonInsertedLength,
      options.documentSettingsPasteBake,
    ).delta;
    pasteRangeEnd = resolvePasteBakeEndExclusive(newDelta, insertIndex, canonInsertedLength);
  }

  // Document invariant (Quill model): the delta must always end with a
  // paragraph-terminating `\n`. Filler-paragraph collapse can strip a run
  // of trailing presentation-only `\n` ops down to nothing when the paste
  // lands at the document tail — leaving the last paragraph without its
  // terminator. The DOM still renders that paragraph as a `<p>` (which
  // DomBridge counts as +1 for the block `\n`), so Delta and DOM drift by
  // one: the first Enter only re-adds the missing terminator (caret appears
  // stuck), and Backspace mismaps. Re-append the terminator here.
  newDelta = ensureTrailingParagraphNewline(newDelta);

  const withTableSep = ensureSeparatorLineAfterPastedTable(newDelta, insertIndex, pasteRangeEnd);
  newDelta = withTableSep.delta;
  pasteRangeEnd = withTableSep.rangeEndExclusive;

  const caretIndex = pasteCaretIndexInRange(newDelta, insertIndex, pasteRangeEnd);

  const pasteChange = diff(delta, newDelta);
  const inverseDelta = invert(pasteChange, delta);

  return {
    ...state,
    delta: newDelta,
    selection: { index: caretIndex, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
  };
}

/**
 * Insert prepared Delta ops at the selection (plain text / pre-built paste payload).
 */
export function insertPastedOps(
  state: EditorState,
  ops: Op[],
  options?: HandlePasteOptions,
): EditorState {
  if (!state.selection || ops.length === 0) return state;
  const prepared = preparePastedOps(ops, options);
  if (prepared.length === 0) return state;
  return composePastedOps(state, prepared, options);
}

/**
 * Handle a paste event.
 *
 * Converts the pasted HTML to a Delta, replaces the selection (if any),
 * and inserts the content at the cursor position.
 */
export function handlePaste(
  state: EditorState,
  html: string,
  options?: HandlePasteOptions,
): EditorState {
  if (!state.selection) return state;

  const pastedDelta = htmlToDelta(html);
  if (pastedDelta.ops.length === 0) return state;

  return insertPastedOps(state, pastedDelta.ops, options);
}

// ---------------------------------------------------------------------------
// handleCut
// ---------------------------------------------------------------------------

/**
 * Handle a cut event.
 *
 * Copies the selection to clipboard data (HTML + plain text) and deletes
 * the selected content. Returns the updated state + clipboard data.
 *
 * If nothing is selected, returns the state unchanged with empty clipboard data.
 */
export function handleCut(
  state: EditorState,
  options?: PrepareCopyOptions,
): { state: EditorState; html: string; text: string } {
  const { delta, history, config } = state;
  const selection =
    state.selection && state.selection.length > 0
      ? expandSelectionToIncludeBlockTerminator(delta, state.selection)
      : state.selection;

  if (!selection || selection.length === 0) {
    return { state, html: '', text: '' };
  }

  const { html, text } = prepareCopy({ ...state, selection }, options);

  const rawChange = new Delta().retain(selection.index).delete(selection.length);
  const { newDelta, change } = composeKeepingDocumentNewline(delta, rawChange);
  const inverseDelta = invert(change, delta);

  const newState: EditorState = {
    ...state,
    delta: newDelta,
    selection: { index: selection.index, length: 0 },
    history: pushUndo(history, inverseDelta, selection, config.history),
  };

  return { state: newState, html, text };
}
