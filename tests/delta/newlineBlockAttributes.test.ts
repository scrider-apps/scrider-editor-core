import { describe, expect, it } from 'vitest';
import type { AttributeMap } from '@scrider/delta';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applyAttributePatchesAtNewlines,
  blockAttrsAtNewlineInOp,
  DEFAULT_SCRIDER_TEXT_INDENT,
  SCRIDER_TEXT_INDENT_KEY,
} from '../../src/delta/newlineBlockAttributes';

function newlineAttrAt(delta: Delta, newlineIndex: number): string | undefined {
  let pos = 0;
  for (const op of delta.ops) {
    if (!isTextInsert(op)) continue;
    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] === '\n' && pos + i === newlineIndex) {
        return op.attributes?.[SCRIDER_TEXT_INDENT_KEY] as string | undefined;
      }
    }
    pos += op.insert.length;
  }
  return undefined;
}

describe('applyAttributePatchesAtNewlines', () => {
  it('indents last line without moving indent from a previous line in a merged op', () => {
    const doc = new Delta()
      .insert('Try typing\nhello\n', { [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT })
      .insert('\n\nPress Enter.\n');

    const helloNl = 'Try typing\nhello\n'.length - 1;
    const lastNl = doc.length() - 1;

    const patches = new Map([[lastNl, { [SCRIDER_TEXT_INDENT_KEY]: DEFAULT_SCRIDER_TEXT_INDENT }]]);
    const result = applyAttributePatchesAtNewlines(doc, patches);

    expect(newlineAttrAt(result, helloNl)).toBe(DEFAULT_SCRIDER_TEXT_INDENT);
    expect(newlineAttrAt(result, lastNl)).toBe(DEFAULT_SCRIDER_TEXT_INDENT);
  });

  it('does not put block attrs on intermediate newlines in a merged op', () => {
    const op = { insert: 'a\nb\n', attributes: { header: 1 } };
    expect(blockAttrsAtNewlineInOp(op, 1)).toEqual({});
    expect(blockAttrsAtNewlineInOp(op, 3)).toEqual({ header: 1 });
  });

  it('assigns block attrs to each newline in a newline-only op and to leading newline after text op', () => {
    const indent = { [SCRIDER_TEXT_INDENT_KEY]: '35.45pt' };
    const nlOnly = { insert: '\n\n', attributes: indent };
    expect(blockAttrsAtNewlineInOp(nlOnly, 0)).toEqual(indent);
    expect(blockAttrsAtNewlineInOp(nlOnly, 1)).toEqual(indent);

    const leading = { insert: '\n', attributes: indent };
    expect(blockAttrsAtNewlineInOp(leading, 0)).toEqual(indent);
  });

  it('splits text op + newline-only op so the first body paragraph keeps indent', () => {
    const indent = { [SCRIDER_TEXT_INDENT_KEY]: '35.45pt', align: 'justify' };
    const doc = new Delta()
      .insert('What is the main research question?')
      .insert('\n\n', indent)
      .insert('Key literature sources.')
      .insert('\n', indent);

    const firstBodyNl = 'What is the main research question?'.length;
    expect(newlineAttrAt(doc, firstBodyNl)).toBe('35.45pt');

    const patches = new Map<number, AttributeMap>();
    patches.set(firstBodyNl, indent);
    const result = applyAttributePatchesAtNewlines(doc, patches);
    expect(newlineAttrAt(result, firstBodyNl)).toBe('35.45pt');
  });

  it('applies indent on trailing newline after split text ops', () => {
    const indent = { [SCRIDER_TEXT_INDENT_KEY]: '35.45pt', align: 'justify' };
    const doc = new Delta()
      .insert('Planned contents:', { bold: true })
      .insert(' Origins of the concept.')
      .insert('\n');

    const lastNl = doc.length() - 1;
    const result = applyAttributePatchesAtNewlines(doc, new Map([[lastNl, indent]]));
    expect(newlineAttrAt(result, lastNl)).toBe('35.45pt');
    const lastOp = result.ops[result.ops.length - 1]!;
    expect(isTextInsert(lastOp) && lastOp.attributes?.align === 'justify').toBe(true);
  });
});
