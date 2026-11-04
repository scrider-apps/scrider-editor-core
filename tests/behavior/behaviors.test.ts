import { describe, expect, it } from 'vitest';
import { Delta } from '@scrider/delta';

import type { BehaviorHook, EditorBehavior } from '../../src/behavior';
import { decreaseIndent, increaseIndent } from '../../src/commands/block';
import {
  deleteBackward,
  deleteForward,
  exitBlock,
  selectAll,
  splitBlock,
} from '../../src/commands/structure';
import { PluginManager } from '../../src/plugin/PluginManager';
import { PluginRegistry } from '../../src/registry/PluginRegistry';
import { createEditorState } from '../../src/state';
import type { EditorState } from '../../src/state';

function makeState(behaviors: EditorBehavior[], index = 2, length = 0): EditorState {
  return createEditorState({
    delta: new Delta().insert('abcd\n'),
    selection: { index, length },
    config: { behaviors },
  });
}

const marked = (state: EditorState): EditorState => ({
  ...state,
  selection: { index: 0, length: 0 },
});

describe('EditorBehavior', () => {
  it('defaults to no behaviors', () => {
    expect(createEditorState().config.behaviors).toEqual([]);
  });

  it.each([
    ['splitBlock', splitBlock],
    ['exitBlock', exitBlock],
    ['deleteBackward', deleteBackward],
    ['deleteForward', deleteForward],
    ['selectAll', selectAll],
  ] as const)('%s returns the behavior result', (name, command) => {
    const state = makeState([{ name: 'test', [name]: marked }]);
    const next = command(state);
    expect(next.selection).toEqual({ index: 0, length: 0 });
    expect(next.delta).toBe(state.delta);
  });

  it('falls through to built-in logic when the hook returns null', () => {
    const pass: BehaviorHook = () => null;
    const state = makeState([{ name: 'test', splitBlock: pass }]);
    expect(splitBlock(state).delta.ops).toEqual([{ insert: 'ab\ncd\n' }]);
  });

  it('runs behaviors in order, first non-null wins', () => {
    const calls: string[] = [];
    const record =
      (name: string, result: BehaviorHook): BehaviorHook =>
      (s) => {
        calls.push(name);
        return result(s);
      };
    const state = makeState([
      { name: 'a', deleteBackward: record('a', () => null) },
      { name: 'b', deleteBackward: record('b', marked) },
      { name: 'c', deleteBackward: record('c', (s) => s) },
    ]);
    deleteBackward(state);
    expect(calls).toEqual(['a', 'b']);
  });

  it('returning the input state blocks the command', () => {
    const block: BehaviorHook = (s) => s;
    const state = makeState([{ name: 'test', deleteForward: block }]);
    expect(deleteForward(state)).toBe(state);
  });

  it('delete hooks do not run for a range selection', () => {
    const state = makeState([{ name: 'test', deleteBackward: marked }], 1, 2);
    expect(deleteBackward(state).delta.ops).toEqual([{ insert: 'ad\n' }]);
  });

  it('indentLine replaces the built-in indent patch per line', () => {
    const behavior: EditorBehavior = {
      name: 'test',
      indentLine: (_attrs, direction) => (direction === 1 ? { indent: 3 } : { align: 'right' }),
    };
    const up = increaseIndent(makeState([behavior]));
    expect(up.delta.ops).toEqual([{ insert: 'abcd' }, { insert: '\n', attributes: { indent: 3 } }]);
    const down = decreaseIndent(makeState([behavior]));
    expect(down.delta.ops).toEqual([
      { insert: 'abcd' },
      { insert: '\n', attributes: { align: 'right' } },
    ]);
  });

  it('PluginManager collects plugin behaviors in plugin order', () => {
    const a: EditorBehavior = { name: 'a' };
    const b: EditorBehavior = { name: 'b' };
    const manager = new PluginManager([
      { name: 'one', registry: new PluginRegistry('one'), behavior: a },
      { name: 'two', registry: new PluginRegistry('two') },
      { name: 'three', registry: new PluginRegistry('three'), behavior: b },
    ]);
    expect(manager.getBehaviors()).toEqual([a, b]);
  });
});
