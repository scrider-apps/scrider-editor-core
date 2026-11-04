import { describe, it, expect } from 'vitest';
import { Delta, isTextInsert } from '@scrider/delta';

import { createEditorState } from '../../src/state';
import { getPlainText } from '../../src/queries';
import {
  applySmartDashReplace,
  countSmartDashReplacements,
  findSpacedDashSpans,
} from '../../src/commands/smartDashReplace';

describe('smartDashReplace', () => {
  it('findSpacedDashSpans — academic: hyphen and em-dash with spaces', () => {
    const text = 'foo - bar and x — y\n';
    const spans = findSpacedDashSpans(text, 'academic');
    expect(spans).toHaveLength(2);
    expect(spans[0]!.replacement).toBe('\u00A0\u2013\u00A0');
  });

  it('findSpacedDashSpans — literary: hyphen and en-dash', () => {
    const text = 'foo - bar and x – y\n';
    const spans = findSpacedDashSpans(text, 'literary');
    expect(spans).toHaveLength(2);
    expect(spans[0]!.replacement).toBe(' \u2014 ');
  });

  it('applySmartDashReplace — academic with NBSP edges', () => {
    const delta = new Delta().insert('Range 1941 - 1945 and end — fin.\n');
    const state = createEditorState({ delta });
    const next = applySmartDashReplace(state, 'academic');
    expect(getPlainText(next)).toContain('\u00A0\u2013\u00A0');
    expect(getPlainText(next)).not.toMatch(/ - /);
  });

  it('countSmartDashReplacements returns 0 when nothing to change', () => {
    const delta = new Delta().insert('already\u00A0\u2013\u00A0ok\n');
    const state = createEditorState({ delta });
    expect(countSmartDashReplacements(state, 'academic')).toBe(0);
  });

  it('skips spaced dashes inside backticks (` - `, ` – `, ` — `)', () => {
    const text = 'plain - ok and ` - ` and ` – ` and ` — ` end\n';
    const spans = findSpacedDashSpans(text, 'academic');
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]!.plainStart, spans[0]!.plainStart + spans[0]!.plainLength)).toBe(
      ' - ',
    );
  });

  it('applySmartDashReplace leaves backtick-wrapped dashes unchanged', () => {
    const delta = new Delta().insert('a - b and ` - ` c\n');
    const state = createEditorState({ delta });
    const next = applySmartDashReplace(state, 'academic');
    expect(getPlainText(next)).toContain('` - `');
    expect(getPlainText(next)).toContain('\u00A0\u2013\u00A0');
    expect(getPlainText(next).match(/\u00A0\u2013\u00A0/g)?.length).toBe(1);
  });

  it('skips spaced dash overlapping inline code attribute ({ code: true })', () => {
    const delta = new Delta()
      .insert('plain ')
      .insert('- ', { code: true })
      .insert('and wide - end\n');
    const state = createEditorState({ delta });
    expect(countSmartDashReplacements(state, 'academic')).toBe(1);
    const next = applySmartDashReplace(state, 'academic');
    expect(getPlainText(next)).toContain('- ');
    const codePart = next.delta.ops.find(
      (op) => isTextInsert(op) && op.insert.includes('-') && op.attributes?.code === true,
    );
    expect(codePart && isTextInsert(codePart) ? codePart.insert : undefined).toBe('- ');
  });

  it('skips when entire spaced dash run has { code: true }', () => {
    const delta = new Delta().insert('before ').insert(' - ', { code: true }).insert('after\n');
    expect(countSmartDashReplacements(createEditorState({ delta }), 'academic')).toBe(0);
  });

  it('skips spaced dashes inside quotes (\' – \', " – ", NBSP)', () => {
    const nbsp = '\u00A0';
    const text = `plain - x and ' – ' and " – " and '${nbsp}\u2013${nbsp}' end\n`;
    const spans = findSpacedDashSpans(text, 'literary');
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]!.plainStart, spans[0]!.plainStart + spans[0]!.plainLength)).toBe(
      ' - ',
    );
  });

  it('applySmartDashReplace leaves quoted en-dashes unchanged', () => {
    const delta = new Delta().insert('a - b and " – " and \u00AB – \u00BB c\n');
    const state = createEditorState({ delta });
    const next = applySmartDashReplace(state, 'literary');
    expect(getPlainText(next)).toContain('" – "');
    expect(getPlainText(next)).toContain('\u00AB – \u00BB');
    expect(getPlainText(next).match(/ \u2014 /g)?.length).toBe(1);
  });
});
