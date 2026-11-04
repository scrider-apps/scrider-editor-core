import { describe, it, expect } from 'vitest';
import { recognizeFontFamily } from '../../src/queries/recognizeFontFamily';
import { recognizeFontFamily as recognizeFromIndex } from '../../src/queries';
import { DROPDOWN_KEYS } from '../../src/registry/modules/toolbar/toolbarKeys';

const KNOWN = DROPDOWN_KEYS.fontFamily!.options.map((o) => o.formatValue).filter(
  (v): v is string => typeof v === 'string',
);

describe('recognizeFontFamily', () => {
  it('returns null when font is absent (System)', () => {
    expect(recognizeFontFamily({}, { knownFamilies: KNOWN })).toBeNull();
    expect(recognizeFontFamily({ font: false }, { knownFamilies: KNOWN })).toBeNull();
  });

  it('returns exact known family with toolbar casing', () => {
    expect(recognizeFontFamily({ font: 'Inter' }, { knownFamilies: KNOWN })).toBe('Inter');
    expect(recognizeFontFamily({ font: 'arial' }, { knownFamilies: KNOWN })).toBe('Arial');
    expect(recognizeFontFamily({ font: 'Times New Roman' }, { knownFamilies: KNOWN })).toBe(
      'Times New Roman',
    );
  });

  it('resolves first known family from a CSS stack (paste)', () => {
    expect(
      recognizeFontFamily(
        {
          font: 'quote-cjk-patch, Inter, system-ui, -apple-system, BlinkMacSystemFont',
        },
        { knownFamilies: KNOWN },
      ),
    ).toBe('Inter');
  });

  it('skips generics, var(), and vendor system fonts in the stack', () => {
    expect(
      recognizeFontFamily(
        {
          font: 'system-ui, var(--scrider-ui-font), -apple-system, "Open Sans", sans-serif',
        },
        { knownFamilies: KNOWN },
      ),
    ).toBe('Open Sans');
  });

  it('returns first concrete token when no known family matches', () => {
    expect(
      recognizeFontFamily({ font: '"My Custom Font", Arial' }, { knownFamilies: ['Inter'] }),
    ).toBe('My Custom Font');
  });

  it('returns null when stack is only generics / vars', () => {
    expect(
      recognizeFontFamily(
        { font: 'system-ui, var(--scrider-ui-font), sans-serif' },
        { knownFamilies: KNOWN },
      ),
    ).toBeNull();
  });

  it('treats CSS-wide keywords (inherit) as System', () => {
    expect(recognizeFontFamily({ font: 'inherit' }, { knownFamilies: KNOWN })).toBeNull();
    expect(recognizeFontFamily({ font: 'initial' }, { knownFamilies: KNOWN })).toBeNull();
    expect(recognizeFontFamily({ font: 'unset' }, { knownFamilies: KNOWN })).toBeNull();
  });

  it('is exported from queries index', () => {
    expect(recognizeFromIndex({ font: 'Roboto' }, { knownFamilies: KNOWN })).toBe('Roboto');
  });
});
