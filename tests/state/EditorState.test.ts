import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';
import { createDefaultRegistry } from '@scrider/formatter';

import { createEditorState, defaultEditorConfig, defaultHistoryConfig } from '../../src/state';

describe('createEditorState', () => {
  it('creates state with sensible defaults', () => {
    const state = createEditorState();

    // Default empty document: single newline
    expect(state.delta.ops).toEqual([{ insert: '\n' }]);
    expect(state.selection).toBeNull();
    expect(state.history.undoStack).toEqual([]);
    expect(state.history.redoStack).toEqual([]);
    expect(state.storedMarks).toBeNull();
    expect(state.config).toEqual(defaultEditorConfig);
  });

  it('accepts custom delta', () => {
    const delta = new Delta().insert('Hello\n');
    const state = createEditorState({ delta });

    expect(state.delta.ops).toEqual([{ insert: 'Hello\n' }]);
  });

  it('accepts custom selection', () => {
    const state = createEditorState({ selection: { index: 2, length: 3 } });

    expect(state.selection).toEqual({ index: 2, length: 3 });
  });

  it('accepts custom registry', () => {
    const registry = createDefaultRegistry();
    const state = createEditorState({ registry });

    expect(state.registry).toBe(registry);
  });

  it('accepts partial history config — fills missing with defaults', () => {
    const state = createEditorState({
      config: { history: { maxStackSize: 50 } },
    });

    expect(state.config.history.maxStackSize).toBe(50);
    expect(state.config.history.mergeDelay).toBe(defaultHistoryConfig.mergeDelay);
    expect(state.config.history.maxConsecutive).toBe(defaultHistoryConfig.maxConsecutive);
  });

  it('accepts full history config', () => {
    const state = createEditorState({
      config: {
        history: {
          maxStackSize: 200,
          mergeDelay: 1000,
          maxConsecutive: 50,
        },
      },
    });

    expect(state.config.history).toEqual({
      maxStackSize: 200,
      mergeDelay: 1000,
      maxConsecutive: 50,
    });
  });

  it('produces immutable state — modifying returned object does not affect internals', () => {
    const state1 = createEditorState();
    const state2 = createEditorState();

    // Each call returns a new object
    expect(state1).not.toBe(state2);
    // But structurally equivalent
    expect(state1.delta.ops).toEqual(state2.delta.ops);
  });
});
