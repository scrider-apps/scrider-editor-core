// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Delta, isTextInsert } from '@scrider/delta';
import type { Op } from '@scrider/delta';

import { insertPastedOps } from '../../src/commands/clipboard';
import { createEditorState } from '../../src/state';
import { SCRIDER_LINE_HEIGHT_KEY } from '../../src/commands/settingsLineSpacing';

// Raw pasted ops (pre-bake) resembling the Busuu fragment: paragraphs +
// softBreak + a simple table + a divider + trailing paragraphs. The plain
// text paragraphs ("What is the passive voice?", "Who did the action?",
// "Use by…") used to lose their baked document settings because the paste
// bake ran BEFORE canonicalize and the filler-collapse step rewrote those
// presentation-bearing `\n` ops to plain paragraph breaks.
const RAW: Op[] = [
  { insert: 'What is the passive voice?\nThe ' },
  { insert: 'passive voice', attributes: { bold: true } },
  { insert: ' is common and we use it when we are ' },
  { insert: 'interested in the action', attributes: { bold: true } },
  { insert: '.' },
  { insert: { softBreak: true } },
  { insert: '\n' },
  { insert: 'My grandfather sold this house in 1995.' },
  { insert: '\n', attributes: { 'table-row': 0, 'table-col': 0 } },
  { insert: 'Active voice info.' },
  { insert: '\n', attributes: { 'table-row': 0, 'table-col': 1 } },
  { insert: 'The house was sold in 1995.' },
  { insert: '\n', attributes: { 'table-row': 1, 'table-col': 0 } },
  { insert: 'Passive voice info.' },
  { insert: '\n', attributes: { 'table-row': 1, 'table-col': 1 } },
  { insert: { divider: true } },
  { insert: '\n' },
  { insert: 'Who did the action?\n' },
  { insert: 'Use by to mention the person who did the action.\n' },
];

describe('smart-paste document-settings bake', () => {
  it('bakes line spacing onto EVERY plain paragraph, incl. those after table/divider', () => {
    const empty = createEditorState({
      delta: new Delta([{ insert: '\n' }]),
      selection: { index: 0, length: 0 },
    });

    const next = insertPastedOps(empty, RAW, {
      documentSettingsPasteBake: {
        lineSpacing: 1.5,
        paragraphSpacingAfterEm: 0.5,
        paragraphSpacingBeforeEm: 0,
      },
    });

    const unbaked: number[] = [];
    let i = 0;
    for (const op of next.delta.ops) {
      if (isTextInsert(op)) {
        const s = op.insert;
        for (let k = 0; k < s.length; k++) {
          if (s[k] === '\n') {
            const attrs = op.attributes ?? {};
            const isTable = attrs['table-row'] != null;
            const isHeader = attrs.header != null;
            if (!isTable && !isHeader && attrs[SCRIDER_LINE_HEIGHT_KEY] !== '1.5') {
              unbaked.push(i);
            }
          }
        }
      }
      i++;
    }

    expect(unbaked).toHaveLength(0);
  });
});
