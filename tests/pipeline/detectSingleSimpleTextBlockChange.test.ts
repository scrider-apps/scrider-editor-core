import { describe, expect, it } from 'vitest';
import type { Op } from '@scrider/delta';

import { detectSingleSimpleTextBlockChange } from '../../src/pipeline';

const P = (text: string, attrs?: Record<string, unknown>): Op[] => [
  { insert: text },
  attrs ? { insert: '\n', attributes: attrs } : { insert: '\n' },
];

describe('detectSingleSimpleTextBlockChange', () => {
  it('detects a single-char insert in a lone paragraph', () => {
    const oldOps: Op[] = [{ insert: 'helo\n' }];
    const newOps: Op[] = [{ insert: 'hello\n' }];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
    expect(change!.startDeltaIndex).toBe(0);
    expect(change!.newBlockOps).toEqual([{ insert: 'hello' }, { insert: '\n' }]);
  });

  it('returns null when nothing changed', () => {
    const ops: Op[] = [{ insert: 'hello\nworld\n' }];
    expect(detectSingleSimpleTextBlockChange(ops, ops)).toBeNull();
  });

  it('reports the correct start index for a change in a later block', () => {
    const oldOps: Op[] = [{ insert: 'first\nsecnd\nthird\n' }];
    const newOps: Op[] = [{ insert: 'first\nsecond\nthird\n' }];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(1);
    expect(change!.startDeltaIndex).toBe(6);
    expect(change!.newBlockOps).toEqual([{ insert: 'second' }, { insert: '\n' }]);
  });

  it('returns null when two blocks changed', () => {
    const oldOps: Op[] = [{ insert: 'aaa\nbbb\n' }];
    const newOps: Op[] = [{ insert: 'aax\nbby\n' }];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('returns null when block count changes (new paragraph)', () => {
    const oldOps: Op[] = [{ insert: 'hello\n' }];
    const newOps: Op[] = [{ insert: 'hel\nlo\n' }];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('detects text edit inside a heading (terminator unchanged)', () => {
    const oldOps: Op[] = [...P('Titl', { header: 1 }), { insert: 'body\n' }];
    const newOps: Op[] = [...P('Title', { header: 1 }), { insert: 'body\n' }];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
    expect(change!.newBlockOps).toEqual([
      { insert: 'Title' },
      { insert: '\n', attributes: { header: 1 } },
    ]);
  });

  it('returns null when the block type changes (header level)', () => {
    const oldOps: Op[] = [...P('Title', { header: 1 })];
    const newOps: Op[] = [...P('Title', { header: 2 })];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('detects text edit inside a list item', () => {
    const oldOps: Op[] = [...P('itm', { list: 'bullet' })];
    const newOps: Op[] = [...P('item', { list: 'bullet' })];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
    expect(change!.newBlockOps).toEqual([
      { insert: 'item' },
      { insert: '\n', attributes: { list: 'bullet' } },
    ]);
  });

  it('returns null for indented (nested) list blocks', () => {
    const oldOps: Op[] = [...P('itm', { list: 'bullet', indent: 1 })];
    const newOps: Op[] = [...P('item', { list: 'bullet', indent: 1 })];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('returns null for code blocks', () => {
    const oldOps: Op[] = [...P('cod', { 'code-block': true })];
    const newOps: Op[] = [...P('code', { 'code-block': true })];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('returns null for blockquote blocks', () => {
    const oldOps: Op[] = [...P('quot', { blockquote: true })];
    const newOps: Op[] = [...P('quote', { blockquote: true })];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('returns null for table-row blocks', () => {
    const oldOps: Op[] = [...P('cel', { 'table-row': 'r1' })];
    const newOps: Op[] = [...P('cell', { 'table-row': 'r1' })];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('detects text edit in a block with an UNCHANGED inline image embed', () => {
    const oldOps: Op[] = [{ insert: 'a' }, { insert: { image: 'x' } }, { insert: '\n' }];
    const newOps: Op[] = [{ insert: 'ab' }, { insert: { image: 'x' } }, { insert: '\n' }];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
    expect(change!.newBlockOps).toEqual([
      { insert: 'ab' },
      { insert: { image: 'x' } },
      { insert: '\n' },
    ]);
  });

  it('detects text edit in a block with an UNCHANGED inline formula embed', () => {
    const oldOps: Op[] = [{ insert: 'see ' }, { insert: { formula: 'x^2' } }, { insert: ' end\n' }];
    const newOps: Op[] = [
      { insert: 'see ' },
      { insert: { formula: 'x^2' } },
      { insert: ' ends\n' },
    ];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
  });

  it('returns null when the inline embed itself changed (formula edited)', () => {
    const oldOps: Op[] = [{ insert: 'q ' }, { insert: { formula: 'x^2' } }, { insert: '\n' }];
    const newOps: Op[] = [{ insert: 'q ' }, { insert: { formula: 'x^3' } }, { insert: '\n' }];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('returns null for a block with an inline video embed (needs full morph)', () => {
    const oldOps: Op[] = [{ insert: 'v' }, { insert: { video: 'u' } }, { insert: '\n' }];
    const newOps: Op[] = [{ insert: 'vv' }, { insert: { video: 'u' } }, { insert: '\n' }];
    expect(detectSingleSimpleTextBlockChange(oldOps, newOps)).toBeNull();
  });

  it('detects edit in a paragraph carrying baked presentation attrs (text-indent)', () => {
    const attrs = { 'scrider-text-indent': '1.25cm' };
    const oldOps: Op[] = [...P('par', attrs)];
    const newOps: Op[] = [...P('para', attrs)];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.blockIndex).toBe(0);
  });

  it('preserves inline formatting ops in the changed block', () => {
    const oldOps: Op[] = [
      { insert: 'hi ' },
      { insert: 'bol', attributes: { bold: true } },
      { insert: '\n' },
    ];
    const newOps: Op[] = [
      { insert: 'hi ' },
      { insert: 'bold', attributes: { bold: true } },
      { insert: '\n' },
    ];
    const change = detectSingleSimpleTextBlockChange(oldOps, newOps);
    expect(change).not.toBeNull();
    expect(change!.newBlockOps).toEqual([
      { insert: 'hi ' },
      { insert: 'bold', attributes: { bold: true } },
      { insert: '\n' },
    ]);
  });
});
