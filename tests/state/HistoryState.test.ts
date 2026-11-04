import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import {
  createHistoryState,
  pushUndo,
  popUndo,
  popRedo,
  pushRedo,
  defaultHistoryConfig,
} from '../../src/state';
import type { HistoryConfig } from '../../src/state';

const config = defaultHistoryConfig;

/** Helper: create a simple inverse delta (delete 1 char at position `pos`). */
function makeInverse(pos: number): Delta {
  return new Delta().retain(pos).delete(1);
}

describe('createHistoryState', () => {
  it('returns empty stacks', () => {
    const h = createHistoryState();
    expect(h.undoStack).toEqual([]);
    expect(h.redoStack).toEqual([]);
    expect(h.lastRecordedAt).toBe(0);
    expect(h.consecutiveCount).toBe(0);
  });
});

describe('pushUndo', () => {
  it('adds an entry to the undo stack', () => {
    const h = createHistoryState();
    const inv = makeInverse(5);
    const sel = { index: 5, length: 0 };

    const h2 = pushUndo(h, inv, sel, config, 1000);

    expect(h2.undoStack).toHaveLength(1);
    expect(h2.undoStack[0]!.changeDelta.ops).toEqual(inv.ops);
    expect(h2.undoStack[0]!.selection).toEqual(sel);
    expect(h2.redoStack).toEqual([]);
    expect(h2.lastRecordedAt).toBe(1000);
    expect(h2.consecutiveCount).toBe(1);
  });

  it('clears redo stack on push', () => {
    let h = createHistoryState();
    h = pushUndo(h, makeInverse(1), { index: 1, length: 0 }, config, 1000);

    // Simulate redo entry
    h = pushRedo(h, makeInverse(2), { index: 2, length: 0 });
    expect(h.redoStack).toHaveLength(1);

    // New push should clear redo
    h = pushUndo(h, makeInverse(3), { index: 3, length: 0 }, config, 5000);
    expect(h.redoStack).toEqual([]);
  });

  it('merges entries within mergeDelay', () => {
    let h = createHistoryState();
    const sel0 = { index: 5, length: 0 };
    const sel1 = { index: 6, length: 0 };

    h = pushUndo(h, makeInverse(5), sel0, config, 1000);
    // Second push within 500ms
    h = pushUndo(h, makeInverse(6), sel1, config, 1200);

    // Should merge: still 1 entry, keeping sel0 (earliest selection)
    expect(h.undoStack).toHaveLength(1);
    expect(h.undoStack[0]!.selection).toEqual(sel0);
    expect(h.consecutiveCount).toBe(2);
  });

  it('does NOT merge after mergeDelay', () => {
    let h = createHistoryState();

    h = pushUndo(h, makeInverse(5), { index: 5, length: 0 }, config, 1000);
    // Second push AFTER 500ms
    h = pushUndo(h, makeInverse(6), { index: 6, length: 0 }, config, 2000);

    expect(h.undoStack).toHaveLength(2);
    expect(h.consecutiveCount).toBe(1);
  });

  it('does NOT merge beyond maxConsecutive', () => {
    const smallConfig: HistoryConfig = { ...config, maxConsecutive: 3 };
    let h = createHistoryState();

    // Push 4 entries in rapid succession
    h = pushUndo(h, makeInverse(1), { index: 1, length: 0 }, smallConfig, 1000);
    h = pushUndo(h, makeInverse(2), { index: 2, length: 0 }, smallConfig, 1010);
    h = pushUndo(h, makeInverse(3), { index: 3, length: 0 }, smallConfig, 1020);
    // consecutiveCount is now 3, which equals maxConsecutive → should NOT merge
    h = pushUndo(h, makeInverse(4), { index: 4, length: 0 }, smallConfig, 1030);

    expect(h.undoStack).toHaveLength(2); // 1 merged group + 1 new entry
    expect(h.consecutiveCount).toBe(1);
  });

  it('trims stack when exceeding maxStackSize', () => {
    const smallConfig: HistoryConfig = { ...config, maxStackSize: 3 };
    let h = createHistoryState();

    // Push 5 entries (with enough delay to prevent merging)
    for (let i = 0; i < 5; i++) {
      h = pushUndo(h, makeInverse(i), { index: i, length: 0 }, smallConfig, i * 1000);
    }

    expect(h.undoStack).toHaveLength(3);
    // Oldest entries trimmed — first entry should be the 3rd pushed
    expect(h.undoStack[0]!.selection).toEqual({ index: 2, length: 0 });
  });

  it('does not mutate the original history', () => {
    const h1 = createHistoryState();
    const h2 = pushUndo(h1, makeInverse(1), { index: 1, length: 0 }, config, 1000);

    expect(h1.undoStack).toHaveLength(0);
    expect(h2.undoStack).toHaveLength(1);
  });
});

describe('popUndo', () => {
  it('returns the last entry and updated history', () => {
    let h = createHistoryState();
    const inv = makeInverse(5);
    const sel = { index: 5, length: 0 };
    h = pushUndo(h, inv, sel, config, 1000);

    const result = popUndo(h);
    expect(result).not.toBeNull();
    expect(result!.entry.changeDelta.ops).toEqual(inv.ops);
    expect(result!.entry.selection).toEqual(sel);
    expect(result!.history.undoStack).toHaveLength(0);
  });

  it('returns null on empty stack', () => {
    const h = createHistoryState();
    expect(popUndo(h)).toBeNull();
  });

  it('pops in LIFO order', () => {
    let h = createHistoryState();
    h = pushUndo(h, makeInverse(1), { index: 1, length: 0 }, config, 1000);
    h = pushUndo(h, makeInverse(2), { index: 2, length: 0 }, config, 5000);

    const result1 = popUndo(h);
    expect(result1!.entry.selection).toEqual({ index: 2, length: 0 });

    const result2 = popUndo(result1!.history);
    expect(result2!.entry.selection).toEqual({ index: 1, length: 0 });

    expect(popUndo(result2!.history)).toBeNull();
  });

  it('resets consecutiveCount to 0', () => {
    let h = createHistoryState();
    h = pushUndo(h, makeInverse(1), { index: 1, length: 0 }, config, 1000);
    h = pushUndo(h, makeInverse(2), { index: 2, length: 0 }, config, 1100);
    expect(h.consecutiveCount).toBe(2);

    const result = popUndo(h);
    expect(result!.history.consecutiveCount).toBe(0);
  });
});

describe('popRedo', () => {
  it('returns the last entry and updated history', () => {
    let h = createHistoryState();
    const inv = makeInverse(5);
    const sel = { index: 5, length: 0 };
    h = pushRedo(h, inv, sel);

    const result = popRedo(h);
    expect(result).not.toBeNull();
    expect(result!.entry.changeDelta.ops).toEqual(inv.ops);
    expect(result!.entry.selection).toEqual(sel);
    expect(result!.history.redoStack).toHaveLength(0);
  });

  it('returns null on empty stack', () => {
    const h = createHistoryState();
    expect(popRedo(h)).toBeNull();
  });
});

describe('pushRedo', () => {
  it('adds an entry to the redo stack', () => {
    const h = createHistoryState();
    const inv = makeInverse(3);
    const sel = { index: 3, length: 0 };

    const h2 = pushRedo(h, inv, sel);

    expect(h2.redoStack).toHaveLength(1);
    expect(h2.redoStack[0]!.changeDelta.ops).toEqual(inv.ops);
    expect(h2.redoStack[0]!.selection).toEqual(sel);
  });

  it('resets consecutiveCount to 0', () => {
    let h = createHistoryState();
    h = pushUndo(h, makeInverse(1), { index: 1, length: 0 }, config, 1000);
    h = pushUndo(h, makeInverse(2), { index: 2, length: 0 }, config, 1100);
    expect(h.consecutiveCount).toBe(2);

    h = pushRedo(h, makeInverse(3), { index: 3, length: 0 });
    expect(h.consecutiveCount).toBe(0);
  });
});
