import { describe, it, expect } from 'vitest';
import { Delta } from '@scrider/delta';

import { splitTextOpsAtNewlines } from '../../src/delta/splitTextOpsAtNewlines';
import { SCRIDER_MARGIN_AFTER_KEY } from '../../src/commands/settingsParagraphSpacing';
import { SCRIDER_LINE_HEIGHT_KEY } from '../../src/commands/settingsLineSpacing';

describe('splitTextOpsAtNewlines', () => {
  it('splits merged paragraph text into line + newline ops', () => {
    const ops = splitTextOpsAtNewlines([{ insert: 'First\nSecond\n' }]);

    expect(ops).toEqual([
      { insert: 'First' },
      { insert: '\n' },
      { insert: 'Second' },
      { insert: '\n' },
    ]);
  });

  it('splits plain multi-line paste blob', () => {
    const ops = splitTextOpsAtNewlines([{ insert: 'Sorrow to this.\nThe dew of the morning' }]);

    expect(ops).toEqual([
      { insert: 'Sorrow to this.' },
      { insert: '\n' },
      { insert: 'The dew of the morning' },
    ]);
  });

  it('is idempotent on already split ops', () => {
    const input = [{ insert: 'A' }, { insert: '\n' }, { insert: 'B' }];
    expect(splitTextOpsAtNewlines(input)).toEqual(input);
  });

  it('keeps standalone structural newline ops unchanged', () => {
    const input = [{ insert: '\n', attributes: { header: 1 } }];
    expect(splitTextOpsAtNewlines(input)).toEqual(input);
  });

  it('puts block attrs on each newline when source op carried them', () => {
    const ops = splitTextOpsAtNewlines([
      {
        insert: 'A\nB\n',
        attributes: {
          bold: true,
          [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
          [SCRIDER_LINE_HEIGHT_KEY]: '1.5',
        },
      },
    ]);

    expect(ops).toEqual([
      { insert: 'A', attributes: { bold: true } },
      {
        insert: '\n',
        attributes: {
          bold: true,
          [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
          [SCRIDER_LINE_HEIGHT_KEY]: '1.5',
        },
      },
      { insert: 'B', attributes: { bold: true } },
      {
        insert: '\n',
        attributes: {
          bold: true,
          [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
          [SCRIDER_LINE_HEIGHT_KEY]: '1.5',
        },
      },
    ]);
  });

  it('keeps a dialog or voice box on the newline, not on the text', () => {
    const ops = splitTextOpsAtNewlines([
      {
        insert: 'Title\n',
        attributes: { 'dialog-id': 'd1', 'dialog-width': '280', 'dialog-float': 'right' },
      },
      {
        insert: 'Topic\n',
        attributes: { 'voice-id': 'v1', 'voice-width': '320', 'voice-float': 'left' },
      },
    ]);

    expect(ops).toEqual([
      { insert: 'Title' },
      {
        insert: '\n',
        attributes: { 'dialog-id': 'd1', 'dialog-width': '280', 'dialog-float': 'right' },
      },
      { insert: 'Topic' },
      {
        insert: '\n',
        attributes: { 'voice-id': 'v1', 'voice-width': '320', 'voice-float': 'left' },
      },
    ]);
  });

  it('preserves total delta length', () => {
    const before = new Delta([{ insert: 'Line1\nLine2\nLine3' }]);
    const after = new Delta(splitTextOpsAtNewlines(before.ops));
    expect(after.length()).toBe(before.length());
  });
});
