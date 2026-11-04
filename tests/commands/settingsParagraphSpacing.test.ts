import { describe, it, expect } from 'vitest';
import { Delta, isTextInsert } from '@scrider/delta';

import {
  applySettingsParagraphSpacingToDelta,
  SCRIDER_MARGIN_AFTER_KEY,
  SCRIDER_MARGIN_BEFORE_KEY,
  settingsParagraphSpacingPreviewWouldPatchDelta,
} from '../../src/commands/settingsParagraphSpacing';

describe('settingsParagraphSpacing', () => {
  it('preview pending when plain paragraphs lack scrider-margin-after', () => {
    const delta = new Delta().insert('A\nB\n');
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0.5)).toBe(true);
  });

  it('preview not pending when all plain paragraphs match', () => {
    const delta = new Delta()
      .insert('A')
      .insert('\n', {
        [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
        [SCRIDER_MARGIN_BEFORE_KEY]: '0em',
      })
      .insert('B')
      .insert('\n', {
        [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
        [SCRIDER_MARGIN_BEFORE_KEY]: '0em',
      });
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0.5, 0)).toBe(false);
  });

  it('apply patches plain paragraphs only', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 1 })
      .insert('Body')
      .insert('\n')
      .insert('Item')
      .insert('\n', { list: 'bullet' });

    const { delta: next, patchedCount } = applySettingsParagraphSpacingToDelta(delta, 0.75);
    expect(patchedCount).toBe(1);
    const nlOps = next.ops.filter(
      (op): op is { insert: string; attributes?: Record<string, unknown> } =>
        isTextInsert(op) && op.insert === '\n',
    );
    expect(nlOps).toHaveLength(3);
    expect(nlOps[0]?.attributes?.[SCRIDER_MARGIN_AFTER_KEY]).toBeUndefined();
    expect(nlOps[1]?.attributes?.[SCRIDER_MARGIN_AFTER_KEY]).toBe('0.75em');
    expect(nlOps[2]?.attributes?.[SCRIDER_MARGIN_AFTER_KEY]).toBeUndefined();
  });

  it('preview not pending when zero before matches absent attr', () => {
    const delta = new Delta().insert('Body').insert('\n', { [SCRIDER_MARGIN_AFTER_KEY]: '0.5em' });
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0.5, 0)).toBe(false);
  });

  it('preview not pending when zero after matches absent attr', () => {
    const delta = new Delta().insert('Body\n');
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0, 0)).toBe(false);
  });

  it('supports zero spacing after', () => {
    const delta = new Delta().insert('A').insert('\n', { [SCRIDER_MARGIN_AFTER_KEY]: '0.5em' });
    const { delta: next, patchedCount } = applySettingsParagraphSpacingToDelta(delta, 0);
    expect(patchedCount).toBe(1);
    const nlOps = next.ops.filter(
      (op): op is { insert: string; attributes?: Record<string, unknown> } =>
        isTextInsert(op) && op.insert === '\n',
    );
    expect(nlOps[0]?.attributes?.[SCRIDER_MARGIN_AFTER_KEY]).toBeUndefined();
  });

  it('apply zero spacing is no-op when margin attrs already absent', () => {
    const delta = new Delta().insert('A\n');
    const { patchedCount } = applySettingsParagraphSpacingToDelta(delta, 0, 0);
    expect(patchedCount).toBe(0);
  });

  it('preview pending when plain paragraphs lack scrider-margin-before', () => {
    const delta = new Delta().insert('A\n');
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0.5, 0.25)).toBe(true);
  });

  it('apply patches before and after on plain paragraphs', () => {
    const delta = new Delta().insert('Body\n');
    const { delta: next, patchedCount } = applySettingsParagraphSpacingToDelta(delta, 0.5, 0.25);
    expect(patchedCount).toBe(1);
    const nl = next.ops.find(
      (op): op is { insert: string; attributes?: Record<string, unknown> } =>
        isTextInsert(op) && op.insert === '\n',
    );
    expect(nl?.attributes?.[SCRIDER_MARGIN_AFTER_KEY]).toBe('0.5em');
    expect(nl?.attributes?.[SCRIDER_MARGIN_BEFORE_KEY]).toBe('0.25em');
  });

  it('preview not pending when before and after match', () => {
    const delta = new Delta().insert('A').insert('\n', {
      [SCRIDER_MARGIN_AFTER_KEY]: '0.5em',
      [SCRIDER_MARGIN_BEFORE_KEY]: '0em',
    });
    expect(settingsParagraphSpacingPreviewWouldPatchDelta(delta, 0.5, 0)).toBe(false);
  });
});
