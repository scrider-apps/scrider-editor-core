import { describe, expect, it } from 'vitest';
import { Delta, compose } from '@scrider/delta';

import {
  buildCodeBlockBoxChange,
  findCodeBlockFenceAt,
  listCodeBlockFences,
} from '../../src/commands/codeBlockBox';
import { toggleCodeBlock } from '../../src/commands/block';
import { createEditorState } from '../../src/state';

function twoFences(): Delta {
  return new Delta()
    .insert('intro\n')
    .insert('A')
    .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' })
    .insert('B')
    .insert('\n', { 'code-block': 'mermaid', 'code-block-id': 'm1' })
    .insert('x')
    .insert('\n', { 'code-block': 'js', 'code-block-id': 'j1' });
}

describe('codeBlockBox', () => {
  it('lists fences by id with their start and newlines', () => {
    const fences = listCodeBlockFences(twoFences());
    expect(fences).toEqual([
      { start: 6, newlines: [7, 9], box: { width: null, float: null, height: null } },
      { start: 10, newlines: [11], box: { width: null, float: null, height: null } },
    ]);
  });

  it('splits two adjacent id-less fences of different languages', () => {
    const delta = new Delta()
      .insert('a')
      .insert('\n', { 'code-block': 'js' })
      .insert('b')
      .insert('\n', { 'code-block': 'python' });
    expect(listCodeBlockFences(delta).map((f) => f.newlines)).toEqual([[1], [3]]);
  });

  it('writes width and float on every newline of the fence only', () => {
    const delta = twoFences();
    const change = buildCodeBlockBoxChange(delta, 6, { width: 320, float: 'right' });
    expect(change).not.toBeNull();
    const next = compose(delta, change!);

    const [diagram, code] = listCodeBlockFences(next);
    expect(diagram!.box).toEqual({ width: 320, float: 'right', height: null });
    expect(code!.box).toEqual({ width: null, float: null, height: null });
    expect(next.ops[1]).toEqual({
      insert: '\n',
      attributes: {
        'code-block': 'mermaid',
        'code-block-id': 'm1',
        'code-block-width': '320',
        'code-block-float': 'right',
      },
    });
  });

  it('clamps width to the minimum and removes keys with null', () => {
    const delta = twoFences();
    const narrow = compose(delta, buildCodeBlockBoxChange(delta, 8, { width: 40 })!);
    expect(findCodeBlockFenceAt(narrow, 8)!.box.width).toBe(120);

    const cleared = compose(narrow, buildCodeBlockBoxChange(narrow, 8, { width: null })!);
    expect(findCodeBlockFenceAt(cleared, 8)!.box.width).toBeNull();
    expect(cleared.ops[1]).toEqual({
      insert: '\n',
      attributes: { 'code-block': 'mermaid', 'code-block-id': 'm1' },
    });
  });

  it('returns null outside a fence or when nothing changes', () => {
    const delta = twoFences();
    expect(buildCodeBlockBoxChange(delta, 0, { width: 300 })).toBeNull();
    expect(buildCodeBlockBoxChange(delta, 6, { float: null })).toBeNull();
  });

  it('takes the box from any line, so one line without keys does not reset it', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', { 'code-block': 'js', 'code-block-id': 'c1' })
      .insert('B')
      .insert('\n', {
        'code-block': 'js',
        'code-block-id': 'c1',
        'code-block-width': '300',
        'code-block-float': 'center',
      });
    expect(listCodeBlockFences(delta)[0]!.box).toEqual({
      width: 300,
      float: 'center',
      height: null,
    });
  });

  it('writes height on every newline of the fence', () => {
    const delta = twoFences();
    const next = compose(delta, buildCodeBlockBoxChange(delta, 6, { height: 240 })!);
    expect(listCodeBlockFences(next)[0]!.box.height).toBe(240);
    expect(listCodeBlockFences(next)[1]!.box.height).toBeNull();
    expect(next.ops[1]).toEqual({
      insert: '\n',
      attributes: {
        'code-block': 'mermaid',
        'code-block-id': 'm1',
        'code-block-height': '240',
      },
    });
  });

  it('toggling the code block off drops width, float and height', () => {
    const delta = new Delta().insert('A').insert('\n', {
      'code-block': 'js',
      'code-block-width': '300',
      'code-block-float': 'left',
      'code-block-height': '200',
    });
    const state = createEditorState({ delta, selection: { index: 0, length: 0 } });
    const result = toggleCodeBlock(state, 'js');
    expect(result.delta.ops).toEqual([{ insert: 'A' }, { insert: '\n' }]);
  });
});
