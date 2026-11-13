import { describe, it, expect } from 'vitest';
import { recognizeFontSize } from '../../src/queries/recognizeFontSize';
import {
  HEADER_SIZE_PRESETS,
  BASE_FONT_SIZE_PT,
  DEFAULT_HEADER_SIZE_PRESET,
} from '../../src/queries/headerDefaults';
import { recognizeFontSize as recognizeFromIndex } from '../../src/queries';

describe('recognizeFontSize', () => {
  it('returns explicit inline size when present', () => {
    expect(recognizeFontSize({ size: '48pt' }, { headerSizePreset: 'scrider' })).toBe('48pt');
  });

  it('treats CSS-wide size keywords as Auto (body base pt)', () => {
    expect(recognizeFontSize({ size: 'inherit' }, { headerSizePreset: 'scrider' })).toBe(
      BASE_FONT_SIZE_PT,
    );
  });

  it('returns 12pt for body text without inline size', () => {
    expect(recognizeFontSize({}, { headerSizePreset: 'scrider' })).toBe(BASE_FONT_SIZE_PT);
    expect(recognizeFontSize({ header: false }, { headerSizePreset: 'google' })).toBe(
      BASE_FONT_SIZE_PT,
    );
  });

  it('returns preset heading size when header level set and size absent', () => {
    expect(recognizeFontSize({ header: 1 }, { headerSizePreset: DEFAULT_HEADER_SIZE_PRESET })).toBe(
      HEADER_SIZE_PRESETS.scrider[1],
    );
    expect(recognizeFontSize({ header: 5 }, { headerSizePreset: 'google' })).toBe('12pt');
    expect(recognizeFontSize({ header: 1 }, { headerSizePreset: 'githubEm' })).toBe('32pt');
  });

  it('returns document base size for body text without inline size', () => {
    const settings = { headerSizePreset: 'scrider', baseFontSize: '14pt' } as const;
    expect(recognizeFontSize({}, settings)).toBe('14pt');
    expect(recognizeFontSize({ size: 'inherit' }, settings)).toBe('14pt');
    expect(recognizeFontSize({ size: '10pt' }, settings)).toBe('10pt');
  });

  it('keeps preset heading size when document base size is set', () => {
    expect(
      recognizeFontSize({ header: 1 }, { headerSizePreset: 'scrider', baseFontSize: '14pt' }),
    ).toBe('32pt');
  });

  it('is exported from queries index', () => {
    expect(recognizeFromIndex({ header: 2 }, { headerSizePreset: 'word' })).toBe('18pt');
  });
});
