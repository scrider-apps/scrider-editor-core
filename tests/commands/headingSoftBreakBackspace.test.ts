import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { splitBlock, deleteBackward, insertSoftBreak } from '../../src/commands/structure';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

/**
 * Regression suite for a real user-reported bug:
 *
 *   1. Caret at end of an H1 line ("Hello|").
 *   2. Shift+Enter (insertSoftBreak)  → caret on the visual second line of H1.
 *   3. Backspace (deleteBackward)     → soft-break removed, caret back at "Hello|".
 *   4. Enter (splitBlock)             → new empty line below H1.
 *   5. Backspace (deleteBackward)     → empty line removed.
 *
 * Expected end state: same as start — `[{"insert":"Hello"},{"insert":"\n",{header:1}}]`.
 *
 * The user reported that step 5 (Backspace after the Enter) drops the H1
 * attribute even though the same Backspace WITHOUT the prior Shift+Enter
 * cycle keeps H1 intact. This test pins the editor-core behaviour so we
 * can confirm whether the corruption originates in commands (here) or in
 * the React DOM layer (browser-driven insertParagraph re-parse).
 */

function makeH1State(): EditorState {
  // delta: "Hello" + "\n"{header:1}  → length 6
  const delta = new Delta().insert('Hello').insert('\n', { header: 1 });
  return { ...createEditorState({ delta }), selection: { index: 5, length: 0 } };
}

/** Convenience: assert that delta still represents a single H1 "Hello\n". */
function expectIsH1Hello(state: EditorState): void {
  const ops = state.delta.ops;
  expect(ops).toHaveLength(2);
  expect(ops[0]).toEqual({ insert: 'Hello' });
  expect(ops[1]).toEqual({ insert: '\n', attributes: { header: 1 } });
  expect(state.selection).toEqual({ index: 5, length: 0 });
}

describe('regression: H1 + Shift+Enter + Backspace + Enter + Backspace', () => {
  it('step 1 (baseline) → H1 "Hello"', () => {
    expectIsH1Hello(makeH1State());
  });

  it('step 2: Shift+Enter inserts a softBreak before the trailing \\n', () => {
    const s2 = insertSoftBreak(makeH1State());
    expect(s2.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: { softBreak: true } },
      { insert: '\n', attributes: { header: 1 } },
    ]);
    expect(s2.selection).toEqual({ index: 6, length: 0 });
  });

  it('step 3: Backspace removes the softBreak, restoring H1 "Hello"', () => {
    const s2 = insertSoftBreak(makeH1State());
    const s3 = deleteBackward(s2);
    expectIsH1Hello(s3);
  });

  it('step 4: Enter at end of H1 splits into H1 + empty plain line', () => {
    const s3 = deleteBackward(insertSoftBreak(makeH1State()));
    const s4 = splitBlock(s3);
    expect(s4.delta.ops).toEqual([
      { insert: 'Hello' },
      { insert: '\n', attributes: { header: 1 } },
      { insert: '\n' },
    ]);
    expect(s4.selection).toEqual({ index: 6, length: 0 });
  });

  it('step 5: Backspace removes the empty line and preserves H1', () => {
    const s3 = deleteBackward(insertSoftBreak(makeH1State()));
    const s4 = splitBlock(s3);
    const s5 = deleteBackward(s4);
    expectIsH1Hello(s5);
  });

  it('Enter+Backspace WITHOUT prior softBreak round-trip also preserves H1 (sanity)', () => {
    const s4 = splitBlock(makeH1State());
    const s5 = deleteBackward(s4);
    expectIsH1Hello(s5);
  });
});
