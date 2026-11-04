import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { canUndo, canRedo } from '../../src/queries';
import { createEditorState, pushUndo, pushRedo, defaultHistoryConfig } from '../../src/state';

describe('canUndo', () => {
  it('returns false for fresh state', () => {
    const state = createEditorState();
    expect(canUndo(state)).toBe(false);
  });

  it('returns true after pushUndo', () => {
    let state = createEditorState();
    const inv = new Delta().retain(1).delete(1);
    state = {
      ...state,
      history: pushUndo(state.history, inv, { index: 1, length: 0 }, defaultHistoryConfig, 1000),
    };

    expect(canUndo(state)).toBe(true);
  });
});

describe('canRedo', () => {
  it('returns false for fresh state', () => {
    const state = createEditorState();
    expect(canRedo(state)).toBe(false);
  });

  it('returns true when redo stack has entries', () => {
    let state = createEditorState();
    state = {
      ...state,
      history: pushRedo(state.history, new Delta().retain(1).insert('a'), { index: 1, length: 0 }),
    };

    expect(canRedo(state)).toBe(true);
  });
});
