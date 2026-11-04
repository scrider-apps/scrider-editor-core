import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { undo, redo } from '../../src/commands/history';
import { insertText } from '../../src/commands/structure';
import { createEditorState } from '../../src/state';
import type { EditorState, HistoryConfig } from '../../src/state';

/** Config that NEVER merges (each edit → separate undo entry). */
const noMerge: HistoryConfig = { maxStackSize: 100, mergeDelay: 0, maxConsecutive: 20 };

/** Config that ALWAYS merges (all edits in rapid sequence → one entry). */
const alwaysMerge: HistoryConfig = { maxStackSize: 100, mergeDelay: 999_999, maxConsecutive: 100 };

/** Helper: single-line doc with selection and NO merge. */
function makeState(text: string, index: number, length = 0): EditorState {
  const delta = new Delta().insert(text + '\n');
  return createEditorState({
    delta,
    selection: { index, length },
    config: { history: noMerge },
  });
}

// ========================================================================
// undo
// ========================================================================

describe('undo', () => {
  it('reverts the last change', () => {
    const base = makeState('Hello', 5);
    const edited = insertText(base, ' World');

    // Now: "Hello World\n"
    expect(edited.delta.ops).toEqual([{ insert: 'Hello World\n' }]);

    const undone = undo(edited);

    expect(undone.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('restores selection', () => {
    const base = makeState('Hello', 5);
    const edited = insertText(base, 'X');

    // Cursor moved to 6 after insert
    expect(edited.selection).toEqual({ index: 6, length: 0 });

    const undone = undo(edited);

    // Selection restored to before the insert
    expect(undone.selection).toEqual({ index: 5, length: 0 });
  });

  it('returns state unchanged on empty undo stack', () => {
    const state = makeState('Hello', 5);
    expect(undo(state)).toBe(state);
  });

  it('clears storedMarks (undo resets to detect mode)', () => {
    const base = makeState('Hello', 5);
    const withMarks: EditorState = { ...base, storedMarks: { bold: true } };
    const edited = insertText(withMarks, 'X');
    const undone = undo(edited);

    expect(undone.storedMarks).toBeNull();
  });
});

// ========================================================================
// redo
// ========================================================================

describe('redo', () => {
  it('re-applies the undone change', () => {
    const base = makeState('Hello', 5);
    const edited = insertText(base, 'X');
    const undone = undo(edited);
    const redone = redo(undone);

    expect(redone.delta.ops).toEqual([{ insert: 'HelloX\n' }]);
  });

  it('restores selection after redo', () => {
    const base = makeState('Hello', 5);
    const edited = insertText(base, 'X');
    const undone = undo(edited);
    const redone = redo(undone);

    // After redo, cursor should be back at 6 (after inserted X)
    expect(redone.selection).toEqual({ index: 6, length: 0 });
  });

  it('returns state unchanged on empty redo stack', () => {
    const state = makeState('Hello', 5);
    expect(redo(state)).toBe(state);
  });
});

// ========================================================================
// undo + redo roundtrip
// ========================================================================

describe('undo + redo roundtrip', () => {
  it('undo + redo → identical document', () => {
    const base = makeState('Hello', 5);
    const edited = insertText(base, ' World');

    const undone = undo(edited);
    const redone = redo(undone);

    expect(redone.delta.ops).toEqual(edited.delta.ops);
  });

  it('chain: edit → edit → undo → undo → redo → redo', () => {
    const s0 = makeState('ABC', 3);

    // Edit 1: insert "D"
    const s1 = insertText(s0, 'D');
    expect(s1.delta.ops).toEqual([{ insert: 'ABCD\n' }]);

    // Edit 2: insert "E" (cursor at 4)
    const s2 = insertText(s1, 'E');
    expect(s2.delta.ops).toEqual([{ insert: 'ABCDE\n' }]);

    // Undo E
    const s3 = undo(s2);
    expect(s3.delta.ops).toEqual([{ insert: 'ABCD\n' }]);

    // Undo D
    const s4 = undo(s3);
    expect(s4.delta.ops).toEqual([{ insert: 'ABC\n' }]);

    // Redo D
    const s5 = redo(s4);
    expect(s5.delta.ops).toEqual([{ insert: 'ABCD\n' }]);

    // Redo E
    const s6 = redo(s5);
    expect(s6.delta.ops).toEqual([{ insert: 'ABCDE\n' }]);
  });

  it('undo → new edit → redo stack cleared', () => {
    const s0 = makeState('ABC', 3);
    const s1 = insertText(s0, 'D');
    const s2 = undo(s1);

    // Redo is available
    expect(s2.history.redoStack).toHaveLength(1);

    // New edit clears redo (pushUndo clears redoStack)
    const s3 = insertText(s2, 'X');
    expect(s3.history.redoStack).toHaveLength(0);

    // Redo does nothing now
    expect(redo(s3)).toBe(s3);
  });
});

// ========================================================================
// Batching
// ========================================================================

describe('history batching', () => {
  it('fast typing groups into one undo step', () => {
    // Use alwaysMerge config so all edits within the same test merge
    let state = createEditorState({
      delta: new Delta().insert('\n'),
      selection: { index: 0, length: 0 },
      config: { history: alwaysMerge },
    });

    state = insertText(state, 'H');
    state = insertText(state, 'e');
    state = insertText(state, 'l');
    state = insertText(state, 'l');
    state = insertText(state, 'o');

    expect(state.delta.ops).toEqual([{ insert: 'Hello\n' }]);

    // Should be ONE undo step (merged)
    expect(state.history.undoStack).toHaveLength(1);

    // Undo reverts the whole word
    const undone = undo(state);
    expect(undone.delta.ops).toEqual([{ insert: '\n' }]);
  });

  it('no-merge config creates separate undo steps', () => {
    // noMerge config → each edit is a separate entry
    let state = makeState('', 0);

    state = insertText(state, 'A');
    state = insertText(state, 'B');
    state = insertText(state, 'C');

    expect(state.delta.ops).toEqual([{ insert: 'ABC\n' }]);
    expect(state.history.undoStack).toHaveLength(3);

    // Undo removes only the last character
    const u1 = undo(state);
    expect(u1.delta.ops).toEqual([{ insert: 'AB\n' }]);
  });
});
