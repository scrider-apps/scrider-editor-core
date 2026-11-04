import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';
import type { ScriderDocumentMetadata } from '@scrider/formatter';

import {
  setDocumentMetadata,
  updateDocumentMetadata,
  normalizeDocumentMetadata,
  documentMetadataEquals,
  editorStateToScriderDocument,
  documentMetadataFromRecord,
} from '../../src/commands/documentMetadata';
import { undo, redo } from '../../src/commands/history';
import { insertText } from '../../src/commands/structure';
import { createEditorState } from '../../src/state';
import type { EditorState, HistoryConfig } from '../../src/state';

const noMerge: HistoryConfig = { maxStackSize: 100, mergeDelay: 0, maxConsecutive: 20 };
const alwaysMerge: HistoryConfig = { maxStackSize: 100, mergeDelay: 999_999, maxConsecutive: 100 };

function makeState(config: HistoryConfig = noMerge): EditorState {
  return createEditorState({
    delta: new Delta().insert('Hello\n'),
    selection: { index: 5, length: 0 },
    config: { history: config },
  });
}

const meta = (m: ScriderDocumentMetadata): ScriderDocumentMetadata => m;

describe('normalizeDocumentMetadata', () => {
  it('drops undefined and null valued keys', () => {
    expect(
      normalizeDocumentMetadata({
        lineSpacing: 1.5,
        textIndentCm: undefined,
        defaultFont: null,
      }),
    ).toEqual({ lineSpacing: 1.5 });
  });

  it('preserves false and 0', () => {
    expect(normalizeDocumentMetadata({ headingBold: false, paragraphSpacingAfterEm: 0 })).toEqual({
      headingBold: false,
      paragraphSpacingAfterEm: 0,
    });
  });

  it('collapses empty to null', () => {
    expect(normalizeDocumentMetadata({})).toBeNull();
    expect(normalizeDocumentMetadata(null)).toBeNull();
    expect(normalizeDocumentMetadata(undefined)).toBeNull();
    expect(normalizeDocumentMetadata({ textIndentCm: undefined })).toBeNull();
  });
});

describe('documentMetadataEquals', () => {
  it('treats null and null as equal', () => {
    expect(documentMetadataEquals(null, null)).toBe(true);
  });

  it('distinguishes null from a value', () => {
    expect(documentMetadataEquals(null, { lineSpacing: 1 })).toBe(false);
    expect(documentMetadataEquals({ lineSpacing: 1 }, null)).toBe(false);
  });

  it('compares by value regardless of key order', () => {
    expect(
      documentMetadataEquals(
        { lineSpacing: 1.5, headingBold: true },
        { headingBold: true, lineSpacing: 1.5 },
      ),
    ).toBe(true);
    expect(documentMetadataEquals({ lineSpacing: 1.5 }, { lineSpacing: 2 })).toBe(false);
    expect(
      documentMetadataEquals({ lineSpacing: 1.5 }, { lineSpacing: 1.5, headingBold: true }),
    ).toBe(false);
  });
});

describe('setDocumentMetadata', () => {
  it('sets metadata and leaves the op-stream untouched', () => {
    const base = makeState();
    const next = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));

    expect(next.scriderMetadata).toEqual({ lineSpacing: 1.5 });
    expect(next.delta).toBe(base.delta);
  });

  it('normalizes on set', () => {
    const base = makeState();
    const next = setDocumentMetadata(base, { lineSpacing: 1.5, textIndentCm: undefined });
    expect(next.scriderMetadata).toEqual({ lineSpacing: 1.5 });
  });

  it('is a no-op (same reference) when equal to current', () => {
    const base = setDocumentMetadata(makeState(), meta({ lineSpacing: 1.5 }));
    const again = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));
    expect(again).toBe(base);
  });

  it('is a no-op when clearing already-empty metadata', () => {
    const base = makeState();
    expect(setDocumentMetadata(base, null)).toBe(base);
  });

  it('records a single undo step', () => {
    const base = makeState();
    const next = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));
    expect(next.history.undoStack).toHaveLength(1);
    expect(next.history.redoStack).toHaveLength(0);
  });
});

describe('updateDocumentMetadata', () => {
  it('merges a patch into existing metadata', () => {
    const base = setDocumentMetadata(makeState(), meta({ lineSpacing: 1.5 }));
    const next = updateDocumentMetadata(base, { headingBold: true });
    expect(next.scriderMetadata).toEqual({ lineSpacing: 1.5, headingBold: true });
  });

  it('removes a key when patched with undefined/null', () => {
    const base = setDocumentMetadata(makeState(), meta({ lineSpacing: 1.5, headingBold: true }));
    const next = updateDocumentMetadata(base, { headingBold: undefined });
    expect(next.scriderMetadata).toEqual({ lineSpacing: 1.5 });
  });
});

describe('undo / redo of metadata', () => {
  it('restores previous metadata on undo and reapplies on redo', () => {
    const base = makeState();
    const set = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));

    const undone = undo(set);
    expect(undone.scriderMetadata).toBeNull();
    // Metadata-only change composes with an empty delta → new object, same content.
    expect(undone.delta.ops).toEqual(base.delta.ops);

    const redone = redo(undone);
    expect(redone.scriderMetadata).toEqual({ lineSpacing: 1.5 });
  });

  it('restores selection on undo of metadata change', () => {
    const base = makeState();
    const set = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));
    const undone = undo(set);
    expect(undone.selection).toEqual({ index: 5, length: 0 });
  });

  it('undoes two metadata changes independently', () => {
    const base = makeState();
    const first = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));
    const second = setDocumentMetadata(first, meta({ lineSpacing: 2 }));

    expect(second.scriderMetadata).toEqual({ lineSpacing: 2 });
    const back1 = undo(second);
    expect(back1.scriderMetadata).toEqual({ lineSpacing: 1.5 });
    const back2 = undo(back1);
    expect(back2.scriderMetadata).toBeNull();
  });

  it('keeps metadata when undoing a later text edit (atomic separation)', () => {
    const base = makeState(alwaysMerge);
    const withMeta = setDocumentMetadata(base, meta({ lineSpacing: 1.5 }));
    const edited = insertText(withMeta, ' World');

    // Text edit is NOT merged onto the metadata entry (merge guard).
    const afterUndo = undo(edited);
    expect(afterUndo.delta.ops).toEqual([{ insert: 'Hello\n' }]);
    expect(afterUndo.scriderMetadata).toEqual({ lineSpacing: 1.5 });

    // Second undo reverts the metadata change.
    const afterUndo2 = undo(afterUndo);
    expect(afterUndo2.scriderMetadata).toBeNull();
  });

  it('does not disturb metadata when undoing an unrelated text edit', () => {
    const base = setDocumentMetadata(makeState(), meta({ lineSpacing: 1.5 }));
    const edited = insertText(base, 'X');
    const undone = undo(edited);
    expect(undone.scriderMetadata).toEqual({ lineSpacing: 1.5 });
  });
});

describe('serialization', () => {
  it('serializes state to { ops, scrider-metadata }', () => {
    const state = setDocumentMetadata(makeState(), meta({ lineSpacing: 1.5 }));
    const doc = editorStateToScriderDocument(state);
    expect(doc.ops).toEqual([{ insert: 'Hello\n' }]);
    expect(doc['scrider-metadata']).toEqual({ lineSpacing: 1.5 });
  });

  it('omits scrider-metadata when null', () => {
    const doc = editorStateToScriderDocument(makeState());
    expect(doc.ops).toEqual([{ insert: 'Hello\n' }]);
    expect('scrider-metadata' in doc).toBe(false);
  });

  it('parses a metadata record for state creation', () => {
    expect(documentMetadataFromRecord({ lineSpacing: 1.5, textIndentCm: undefined })).toEqual({
      lineSpacing: 1.5,
    });
    expect(documentMetadataFromRecord(undefined)).toBeNull();
    expect(documentMetadataFromRecord({})).toBeNull();
  });
});

describe('createEditorState metadata', () => {
  it('defaults to null', () => {
    expect(createEditorState().scriderMetadata).toBeNull();
  });

  it('accepts initial metadata', () => {
    const state = createEditorState({ scriderMetadata: { lineSpacing: 1.5 } });
    expect(state.scriderMetadata).toEqual({ lineSpacing: 1.5 });
  });
});
