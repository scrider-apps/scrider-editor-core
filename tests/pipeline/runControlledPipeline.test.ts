import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Delta } from '@scrider/delta';

import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';
import { insertText } from '../../src/commands/structure/insert';
import { runControlledPipeline } from '../../src/pipeline';

function stateWithHello(): EditorState {
  return createEditorState({
    delta: new Delta().insert('Hello\n'),
    selection: { index: 5, length: 0 },
  });
}

describe('runControlledPipeline', () => {
  // Bit-for-bit state equality includes history.lastRecordedAt (Date.now()).
  // Freeze time so sequential insertText vs pipeline calls don't flake by 1ms.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('insertText matches insertText() bit-for-bit and emits singleBlock', () => {
    const base = stateWithHello();
    const viaCmd = insertText(base, '!');
    const viaPipe = runControlledPipeline(base, 'insertText', { text: '!' });
    expect(viaPipe.state).toEqual(viaCmd);
    expect(viaPipe.normalizeHint).toEqual({
      kind: 'singleBlock',
      startDeltaIndex: 0,
      newBlockOps: [{ insert: 'Hello!' }, { insert: '\n' }],
    });
  });

  it('insertText empty / missing text is a no-op with full hint', () => {
    const base = stateWithHello();
    expect(runControlledPipeline(base, 'insertText', { text: '' }).state).toBe(base);
    expect(runControlledPipeline(base, 'insertText', { text: '' }).normalizeHint).toEqual({
      kind: 'full',
    });
    expect(runControlledPipeline(base, 'insertText', {}).state).toBe(base);
  });

  it('insertText with storedMarks matches insertText()', () => {
    const base = {
      ...stateWithHello(),
      storedMarks: { bold: true },
    };
    const viaCmd = insertText(base, 'X');
    const viaPipe = runControlledPipeline(base, 'insertText', { text: 'X' });
    expect(viaPipe.state).toEqual(viaCmd);
    expect(viaPipe.state.storedMarks).toBeNull();
    expect(viaPipe.normalizeHint?.kind).toBe('singleBlock');
  });

  it('insertText over a selection matches insertText()', () => {
    const base = createEditorState({
      delta: new Delta().insert('Hello\n'),
      selection: { index: 0, length: 5 },
    });
    const viaCmd = insertText(base, 'Hi');
    const viaPipe = runControlledPipeline(base, 'insertText', { text: 'Hi' });
    expect(viaPipe.state).toEqual(viaCmd);
    expect(viaPipe.normalizeHint?.kind).toBe('singleBlock');
  });

  it('insertText in a list item emits singleBlock', () => {
    const base = createEditorState({
      delta: new Delta().insert('itm').insert('\n', { list: 'bullet' }),
      selection: { index: 3, length: 0 },
    });
    const viaPipe = runControlledPipeline(base, 'insertText', { text: 'e' });
    expect(viaPipe.normalizeHint).toEqual({
      kind: 'singleBlock',
      startDeltaIndex: 0,
      newBlockOps: [{ insert: 'itme' }, { insert: '\n', attributes: { list: 'bullet' } }],
    });
  });

  it('insertText that splits a block falls back to full', () => {
    const base = stateWithHello();
    const viaPipe = runControlledPipeline(base, 'insertText', { text: '\n' });
    expect(viaPipe.normalizeHint).toEqual({ kind: 'full' });
  });

  it('reserved triggers are identity no-ops with full hint', () => {
    const base = stateWithHello();
    for (const trigger of ['paste', 'drop', 'command', 'inputRule', 'contextualKey'] as const) {
      const result = runControlledPipeline(base, trigger, {});
      expect(result.state).toBe(base);
      expect(result.normalizeHint).toEqual({ kind: 'full' });
    }
  });
});
