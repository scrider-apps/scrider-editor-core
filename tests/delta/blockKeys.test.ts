/**
 * The block keys on `\n` come from the formatter schema plus the few keys only
 * the editor knows. A key the formatter registers survives a line patch.
 */

import { describe, expect, it } from 'vitest';
import { Delta } from '@scrider/delta';

import { BLOCK_FORMATS } from '../../src/commands/structure/constants';
import { exitBlock } from '../../src/commands/structure';
import {
  applyAttributePatchesAtNewlines,
  NEWLINE_BLOCK_ATTR_KEYS,
} from '../../src/delta/newlineBlockAttributes';
import { createEditorState } from '../../src/state';

/** The hand-written list of 2.0.4: nothing it kept may be dropped now. */
const KEYS_OF_2_0_4 = [
  'header',
  'header-id',
  'list',
  'list-start',
  'blockquote',
  'code-block',
  'code-block-id',
  'code-block-width',
  'code-block-float',
  'code-block-height',
  'align',
  'indent',
  'table-row',
  'table-col',
  'table-header',
  'table-col-align',
  '__divider',
  '__blockEmbed',
  'scrider-text-indent',
  'scrider-line-height',
  'scrider-margin-after',
  'scrider-margin-before',
  'accordion',
  'accordion-collapsed',
  'accordion-body',
  'accordion-width',
  'accordion-float',
  'quiz-id',
  'quiz-role',
  'quiz-view',
  'quiz-width',
  'quiz-float',
  'quiz-pick',
  'quiz-phase',
  'quiz-limit',
  'quiz-time',
  'dialog-id',
  'dialog-role',
  'dialog-view',
  'dialog-width',
  'dialog-float',
  'voice-id',
  'voice-role',
  'voice-view',
  'voice-width',
  'voice-float',
];

const PLATE_KEYS_OF_FORMATTER_1_24 = [
  'dialog-lang',
  'dialog-model',
  'dialog-voice',
  'dialog-src',
  'dialog-readonly',
  'voice-lang',
  'voice-model',
  'voice-voice',
  'voice-src',
  'quiz-lang',
  'accordion-lang',
];

describe('block keys from the formatter schema', () => {
  it('keeps every key of the 2.0.4 list', () => {
    for (const key of KEYS_OF_2_0_4) expect(NEWLINE_BLOCK_ATTR_KEYS.has(key), key).toBe(true);
  });

  it('knows the plate keys of formatter 1.24 and never takes them for inline marks', () => {
    for (const key of PLATE_KEYS_OF_FORMATTER_1_24) {
      expect(NEWLINE_BLOCK_ATTR_KEYS.has(key), key).toBe(true);
      expect(BLOCK_FORMATS.includes(key), key).toBe(true);
    }
    expect(NEWLINE_BLOCK_ATTR_KEYS.has('bold')).toBe(false);
  });

  it('keeps the language, model and voices of a plate through a patch of another line', () => {
    const title = {
      'dialog-id': 'd1',
      'dialog-role': 'title',
      'dialog-view': 'text',
      'dialog-lang': 'en',
      'dialog-model': 'yandex/yandex-tts',
      'dialog-readonly': true,
    };
    const cue = {
      'dialog-id': 'd1',
      'dialog-role': 'cue',
      'dialog-view': 'text',
      'dialog-voice': 'john',
      'dialog-src': '/api/media/a',
    };
    const doc = new Delta()
      .insert('Talk')
      .insert('\n', title)
      .insert('Hello')
      .insert('\n', cue)
      .insert('Fold')
      .insert('\n', { accordion: 0, 'accordion-lang': 'fr' })
      .insert('Quiz')
      .insert('\n', { 'quiz-id': 'q1', 'quiz-role': 'title', 'quiz-lang': 'de' });
    // Fold the accordion: the patch touches line 3 only, every newline is rewritten.
    const patched = applyAttributePatchesAtNewlines(
      doc,
      new Map([[15, { 'accordion-collapsed': true }]]),
    );
    expect(patched.ops).toEqual([
      { insert: 'Talk' },
      { insert: '\n', attributes: title },
      { insert: 'Hello' },
      { insert: '\n', attributes: cue },
      { insert: 'Fold' },
      {
        insert: '\n',
        attributes: { accordion: 0, 'accordion-lang': 'fr', 'accordion-collapsed': true },
      },
      { insert: 'Quiz' },
      { insert: '\n', attributes: { 'quiz-id': 'q1', 'quiz-role': 'title', 'quiz-lang': 'de' } },
    ]);
  });

  it('Ctrl+Enter leaves a plate without carrying its keys to the plain line', () => {
    const cue = {
      'voice-id': 'v1',
      'voice-role': 'cue',
      'voice-view': 'text',
      'voice-voice': 'alena',
      'voice-src': '/a.mp3',
    };
    const delta = new Delta().insert('Hi').insert('\n', cue);
    const result = exitBlock(createEditorState({ delta, selection: { index: 2, length: 0 } }));
    expect(result.delta.ops).toEqual([
      { insert: 'Hi' },
      { insert: '\n', attributes: cue },
      { insert: '\n' },
    ]);
  });
});
