import { describe, expect, it } from 'vitest';
import { Delta } from '@scrider/delta';

import { applyEditorStateTransition, createEditorState } from '../../src/state';

describe('applyEditorStateTransition', () => {
  it('starts at revision 0', () => {
    expect(createEditorState().revision).toBe(0);
  });

  it('bumps revision when delta identity changes', () => {
    const prev = createEditorState();
    const next = { ...prev, delta: new Delta().insert('Hi\n') };
    expect(applyEditorStateTransition(prev, next).revision).toBe(1);
  });

  it('bumps revision when metadata identity changes', () => {
    const prev = createEditorState();
    const next = { ...prev, scriderMetadata: { lineSpacing: 1.5 } };
    expect(applyEditorStateTransition(prev, next).revision).toBe(1);
  });

  it('does not bump on selection-only updates', () => {
    const prev = createEditorState({
      delta: new Delta().insert('Hi\n'),
    });
    const afterEdit = applyEditorStateTransition(prev, {
      ...prev,
      delta: new Delta().insert('Hi!\n'),
    });
    expect(afterEdit.revision).toBe(1);

    const selectionOnly = applyEditorStateTransition(afterEdit, {
      ...afterEdit,
      selection: { index: 1, length: 0 },
    });
    expect(selectionOnly.revision).toBe(1);
    expect(selectionOnly.selection).toEqual({ index: 1, length: 0 });
  });

  it('is monotonic across undo-shaped content swaps', () => {
    let state = createEditorState({ delta: new Delta().insert('A\n') });
    state = applyEditorStateTransition(state, {
      ...state,
      delta: new Delta().insert('B\n'),
    });
    state = applyEditorStateTransition(state, {
      ...state,
      delta: new Delta().insert('A\n'),
    });
    expect(state.revision).toBe(2);
  });
});
