import { describe, it, expect } from 'vitest';
import {
  HEADER_SIZE_PRESETS,
  HEADER_DEFAULT_SIZES,
  HEADER_DEFAULT_FONT,
  DEFAULT_HEADER_SIZE_PRESET,
  getHeaderSize,
  getHeaderDefaultSize,
  isHeaderLevel,
  type HeaderLevel,
} from '../../src/queries/headerDefaults';

describe('headerDefaults', () => {
  describe('HEADER_DEFAULT_SIZES', () => {
    it('covers levels 1..6', () => {
      for (const level of [1, 2, 3, 4, 5, 6] as const) {
        expect(HEADER_DEFAULT_SIZES[level]).toMatch(/^\d+pt$/);
      }
    });

    it('is monotonically decreasing from H1 to H6', () => {
      const parse = (v: string): number => parseInt(v, 10);
      const levels: HeaderLevel[] = [1, 2, 3, 4, 5, 6];
      for (let i = 0; i < levels.length - 1; i++) {
        const curr = levels[i]!;
        const next = levels[i + 1]!;
        expect(parse(HEADER_DEFAULT_SIZES[curr])).toBeGreaterThan(
          parse(HEADER_DEFAULT_SIZES[next]),
        );
      }
    });

    it('uses canonical toolbar values matching CSS', () => {
      // These exact values are duplicated in the @scrider/editor-react stylesheet.
      // If you change either side without the other, this test will catch it.
      expect(HEADER_DEFAULT_SIZES[1]).toBe('32pt');
      expect(HEADER_DEFAULT_SIZES[2]).toBe('24pt');
      expect(HEADER_DEFAULT_SIZES[3]).toBe('20pt');
      expect(HEADER_DEFAULT_SIZES[4]).toBe('18pt');
      expect(HEADER_DEFAULT_SIZES[5]).toBe('16pt');
      expect(HEADER_DEFAULT_SIZES[6]).toBe('14pt');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(HEADER_DEFAULT_SIZES)).toBe(true);
    });
  });

  describe('HEADER_DEFAULT_FONT', () => {
    it('is a non-empty string', () => {
      expect(typeof HEADER_DEFAULT_FONT).toBe('string');
      expect(HEADER_DEFAULT_FONT.length).toBeGreaterThan(0);
    });
  });

  describe('isHeaderLevel', () => {
    it('accepts integers 1..6', () => {
      for (const level of [1, 2, 3, 4, 5, 6]) {
        expect(isHeaderLevel(level)).toBe(true);
      }
    });

    it('rejects 0 and 7', () => {
      expect(isHeaderLevel(0)).toBe(false);
      expect(isHeaderLevel(7)).toBe(false);
    });

    it('rejects non-integers', () => {
      expect(isHeaderLevel(1.5)).toBe(false);
    });

    it('rejects non-numbers', () => {
      expect(isHeaderLevel('1')).toBe(false);
      expect(isHeaderLevel(null)).toBe(false);
      expect(isHeaderLevel(undefined)).toBe(false);
      expect(isHeaderLevel(true)).toBe(false);
      expect(isHeaderLevel({})).toBe(false);
    });
  });

  describe('getHeaderDefaultSize', () => {
    it('returns the size for valid levels', () => {
      for (const level of [1, 2, 3, 4, 5, 6] as const) {
        expect(getHeaderDefaultSize(level)).toBe(HEADER_DEFAULT_SIZES[level]);
      }
    });

    it('returns null for invalid level', () => {
      expect(getHeaderDefaultSize(0)).toBeNull();
      expect(getHeaderDefaultSize(7)).toBeNull();
      expect(getHeaderDefaultSize('1')).toBeNull();
      expect(getHeaderDefaultSize(null)).toBeNull();
      expect(getHeaderDefaultSize(undefined)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Size-grid presets
  // -----------------------------------------------------------------------

  describe('HEADER_SIZE_PRESETS', () => {
    it('contains all five presets', () => {
      expect(HEADER_SIZE_PRESETS).toHaveProperty('scrider');
      expect(HEADER_SIZE_PRESETS).toHaveProperty('google');
      expect(HEADER_SIZE_PRESETS).toHaveProperty('word');
      expect(HEADER_SIZE_PRESETS).toHaveProperty('browser');
      expect(HEADER_SIZE_PRESETS).toHaveProperty('githubEm');
    });

    it('every pt preset covers levels 1..6 with pt strings', () => {
      for (const preset of ['scrider', 'google', 'word', 'browser'] as const) {
        for (const level of [1, 2, 3, 4, 5, 6] as const) {
          expect(HEADER_SIZE_PRESETS[preset][level]).toMatch(/^\d+pt$/);
        }
      }
    });

    it('githubEm preset uses pt strings (README/GFM scale at 16px base)', () => {
      expect(HEADER_SIZE_PRESETS.githubEm).toEqual({
        1: '32pt',
        2: '24pt',
        3: '20pt',
        4: '16pt',
        5: '14pt',
        6: '14pt',
      });
    });

    it('every pt preset is monotonically non-increasing H1→H6', () => {
      const parse = (v: string): number => parseInt(v, 10);
      const levels: HeaderLevel[] = [1, 2, 3, 4, 5, 6];
      for (const preset of ['scrider', 'google', 'word', 'browser'] as const) {
        const sizes = HEADER_SIZE_PRESETS[preset];
        for (let i = 0; i < levels.length - 1; i++) {
          const curr = levels[i]!;
          const next = levels[i + 1]!;
          expect(parse(sizes[curr])).toBeGreaterThanOrEqual(parse(sizes[next]));
        }
      }
    });

    it('every preset is frozen', () => {
      for (const preset of ['scrider', 'google', 'word', 'browser', 'githubEm'] as const) {
        expect(Object.isFrozen(HEADER_SIZE_PRESETS[preset])).toBe(true);
      }
    });

    it('scrider matches HEADER_DEFAULT_SIZES (default preset)', () => {
      expect(DEFAULT_HEADER_SIZE_PRESET).toBe('scrider');
      expect(HEADER_DEFAULT_SIZES).toBe(HEADER_SIZE_PRESETS.scrider);
    });

    it('exact values match documented presets', () => {
      expect(HEADER_SIZE_PRESETS.scrider).toEqual({
        1: '32pt',
        2: '24pt',
        3: '20pt',
        4: '18pt',
        5: '16pt',
        6: '14pt',
      });
      expect(HEADER_SIZE_PRESETS.google).toEqual({
        1: '26pt',
        2: '20pt',
        3: '16pt',
        4: '14pt',
        5: '12pt',
        6: '11pt',
      });
      expect(HEADER_SIZE_PRESETS.word).toEqual({
        1: '22pt',
        2: '18pt',
        3: '16pt',
        4: '14pt',
        5: '12pt',
        6: '12pt',
      });
      expect(HEADER_SIZE_PRESETS.browser).toEqual({
        1: '24pt',
        2: '18pt',
        3: '14pt',
        4: '12pt',
        5: '10pt',
        6: '8pt',
      });
    });
  });

  describe('getHeaderSize', () => {
    it('returns the size for valid levels under each preset', () => {
      for (const preset of ['scrider', 'google', 'word', 'browser', 'githubEm'] as const) {
        for (const level of [1, 2, 3, 4, 5, 6] as const) {
          expect(getHeaderSize(level, preset)).toBe(HEADER_SIZE_PRESETS[preset][level]);
        }
      }
    });

    it('defaults to the scrider preset when omitted', () => {
      for (const level of [1, 2, 3, 4, 5, 6] as const) {
        expect(getHeaderSize(level)).toBe(HEADER_SIZE_PRESETS.scrider[level]);
      }
    });

    it('returns null for invalid level regardless of preset', () => {
      for (const preset of ['scrider', 'google', 'word', 'browser', 'githubEm'] as const) {
        expect(getHeaderSize(0, preset)).toBeNull();
        expect(getHeaderSize(7, preset)).toBeNull();
        expect(getHeaderSize(null, preset)).toBeNull();
      }
    });
  });
});
