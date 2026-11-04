import { describe, it, expect } from 'vitest';
import { Delta, isTextInsert } from '@scrider/delta';

import { insertPastedOps } from '../../src/commands/clipboard';
import {
  bakeDocumentSettingsOnPasteDelta,
  bakeDocumentSettingsOnSkeletonDelta,
  isSkeletonOnlyDelta,
  listNewlineIndicesInCharRange,
  resolvePasteBakeEndExclusive,
} from '../../src/commands/bakeDocumentSettingsOnPaste';
import { SCRIDER_LINE_HEIGHT_KEY } from '../../src/commands/settingsLineSpacing';
import {
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
} from '../../src/commands/settingsParagraphSpacing';
import { SCRIDER_TEXT_INDENT_KEY } from '../../src/delta/newlineBlockAttributes';
import { createEditorState } from '../../src/state';
import { settingsLineSpacingPreviewWouldPatchDelta } from '../../src/commands/settingsLineSpacing';
import { settingsParagraphSpacingPreviewWouldPatchDelta } from '../../src/commands/settingsParagraphSpacing';

function newlineAttrAt(delta: Delta, index: number): Record<string, unknown> | undefined {
  let pos = 0;
  for (const op of delta.ops) {
    if (!isTextInsert(op)) {
      pos += 1;
      continue;
    }
    for (let i = 0; i < op.insert.length; i++) {
      if (op.insert[i] === '\n' && pos + i === index) {
        return op.attributes;
      }
    }
    pos += op.insert.length;
  }
  return undefined;
}

describe('listNewlineIndicesInCharRange', () => {
  it('lists newline indices inside the range', () => {
    const delta = new Delta([{ insert: 'A' }, { insert: '\n' }, { insert: 'B' }, { insert: '\n' }]);
    expect(listNewlineIndicesInCharRange(delta, 2, 4)).toEqual([3]);
    expect(listNewlineIndicesInCharRange(delta, 0, delta.length())).toEqual([1, 3]);
  });
});

describe('isSkeletonOnlyDelta', () => {
  it('matches a single trailing newline op only', () => {
    expect(isSkeletonOnlyDelta(new Delta([{ insert: '\n' }]))).toBe(true);
    expect(isSkeletonOnlyDelta(new Delta())).toBe(false);
    expect(isSkeletonOnlyDelta(new Delta([{ insert: 'x' }, { insert: '\n' }]))).toBe(false);
    expect(isSkeletonOnlyDelta(new Delta([{ insert: '\n' }, { insert: '\n' }]))).toBe(false);
  });
});

describe('bakeDocumentSettingsOnSkeletonDelta', () => {
  it('stamps document settings on the empty skeleton paragraph', () => {
    const delta = new Delta([{ insert: '\n' }]);
    const baked = bakeDocumentSettingsOnSkeletonDelta(delta, {
      lineSpacing: 1.5,
      paragraphSpacingAfterEm: 0.5,
      paragraphSpacingBeforeEm: 1,
    }).delta;

    expect(newlineAttrAt(baked, 0)?.[SCRIDER_LINE_HEIGHT_KEY]).toBe('1.5');
    expect(newlineAttrAt(baked, 0)?.[SCRIDER_MARGIN_AFTER_KEY]).toBe('0.5em');
    expect(newlineAttrAt(baked, 0)?.[SCRIDER_MARGIN_BEFORE_KEY]).toBe('1em');
  });

  it('no-ops when the document is not skeleton-only', () => {
    const delta = new Delta([{ insert: 'Hi' }, { insert: '\n' }]);
    const result = bakeDocumentSettingsOnSkeletonDelta(delta, { lineSpacing: 1.5 });
    expect(result.patchedCount).toBe(0);
    expect(result.delta).toBe(delta);
  });
});

describe('bakeDocumentSettingsOnPasteDelta', () => {
  it('stamps line spacing and paragraph spacing on pasted plain paragraphs only', () => {
    const delta = new Delta([
      { insert: 'Old' },
      { insert: '\n' },
      { insert: 'New' },
      { insert: '\n' },
    ]);
    const baked = bakeDocumentSettingsOnPasteDelta(delta, 4, 4, {
      lineSpacing: 1.5,
      paragraphSpacingAfterEm: 0.5,
      paragraphSpacingBeforeEm: 0,
    }).delta;

    expect(newlineAttrAt(baked, 3)?.[SCRIDER_LINE_HEIGHT_KEY]).toBeUndefined();
    expect(newlineAttrAt(baked, 7)?.[SCRIDER_LINE_HEIGHT_KEY]).toBe('1.5');
    expect(newlineAttrAt(baked, 7)?.[SCRIDER_MARGIN_AFTER_KEY]).toBe('0.5em');
    expect(newlineAttrAt(baked, 7)?.[SCRIDER_MARGIN_BEFORE_KEY]).toBeUndefined();
  });

  it('stamps first-line indent on pasted plain paragraphs', () => {
    const delta = new Delta([{ insert: 'Line' }, { insert: '\n' }]);
    const baked = bakeDocumentSettingsOnPasteDelta(delta, 0, delta.length(), {
      textIndentCm: 1.25,
    }).delta;

    expect(newlineAttrAt(baked, 4)?.[SCRIDER_TEXT_INDENT_KEY]).toBe('1.25cm');
  });
});

describe('insertPastedOps documentSettingsPasteBake', () => {
  it('auto-bakes document settings into pasted ops', () => {
    const state = createEditorState({
      delta: new Delta(),
      selection: { index: 0, length: 0 },
    });

    const result = insertPastedOps(state, [{ insert: 'Line1\nLine2' }], {
      documentSettingsPasteBake: {
        lineSpacing: 1.5,
        paragraphSpacingAfterEm: 0.5,
        paragraphSpacingBeforeEm: 0,
      },
    });

    expect(newlineAttrAt(result.delta, 5)?.[SCRIDER_LINE_HEIGHT_KEY]).toBe('1.5');
    expect(newlineAttrAt(result.delta, 5)?.[SCRIDER_MARGIN_AFTER_KEY]).toBe('0.5em');
  });

  it('bakes settings onto trailing document newline merged into last pasted line', () => {
    const state = createEditorState({
      delta: new Delta().insert('\n'),
      selection: { index: 0, length: 0 },
    });

    const result = insertPastedOps(
      state,
      [{ insert: 'Line1' }, { insert: '\n' }, { insert: 'Line2' }],
      {
        documentSettingsPasteBake: {
          lineSpacing: 1.5,
          paragraphSpacingAfterEm: 1,
          paragraphSpacingBeforeEm: 1,
        },
      },
    );

    expect(settingsLineSpacingPreviewWouldPatchDelta(result.delta, 1.5)).toBe(false);
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(result.delta, 1, 1)).toBe(false);
    expect(newlineAttrAt(result.delta, 11)?.[SCRIDER_MARGIN_BEFORE_KEY]).toBe('1em');
  });
});

describe('resolvePasteBakeEndExclusive', () => {
  it('extends bake range when document trailing newline merged into last line', () => {
    const delta = new Delta([{ insert: 'A' }, { insert: '\n' }, { insert: 'B\n' }]);
    expect(resolvePasteBakeEndExclusive(delta, 0, 3)).toBe(4);
    expect(listNewlineIndicesInCharRange(delta, 0, 3)).toEqual([1]);
    expect(listNewlineIndicesInCharRange(delta, 0, 4)).toEqual([1, 3]);
  });
});
