import { describe, it, expect } from 'vitest';
import { CORE_TYPES, isCoreType, getCoreType, getCoreTypeNames } from '../../src/registry';

describe('Core Types', () => {
  it('should define all 7 bootstrap types', () => {
    expect(CORE_TYPES).toHaveLength(7);
    const names = CORE_TYPES.map((t) => t.name);
    expect(names).toEqual([
      'button',
      'dropdown',
      'dropdown-option',
      'separator',
      'group',
      'color',
      'custom',
    ]);
  });

  describe('isCoreType', () => {
    it('returns true for known core types', () => {
      expect(isCoreType('button')).toBe(true);
      expect(isCoreType('dropdown')).toBe(true);
      expect(isCoreType('dropdown-option')).toBe(true);
      expect(isCoreType('separator')).toBe(true);
      expect(isCoreType('group')).toBe(true);
      expect(isCoreType('color')).toBe(true);
      expect(isCoreType('custom')).toBe(true);
    });

    it('returns false for unknown types', () => {
      expect(isCoreType('unknown')).toBe(false);
      expect(isCoreType('')).toBe(false);
      expect(isCoreType('Button')).toBe(false);
    });
  });

  describe('getCoreType', () => {
    it('returns type definition for known types', () => {
      const button = getCoreType('button');
      expect(button).toBeDefined();
      expect(button!.name).toBe('button');
      expect(button!.requiredFields).toContain('name');
      expect(button!.requiredFields).toContain('command');
    });

    it('returns undefined for unknown types', () => {
      expect(getCoreType('unknown')).toBeUndefined();
    });

    it('separator has no required fields', () => {
      const sep = getCoreType('separator');
      expect(sep).toBeDefined();
      expect(sep!.requiredFields).toHaveLength(0);
    });

    it('group requires name and items', () => {
      const group = getCoreType('group');
      expect(group).toBeDefined();
      expect(group!.requiredFields).toContain('name');
      expect(group!.requiredFields).toContain('items');
    });
  });

  describe('getCoreTypeNames', () => {
    it('returns all 7 names', () => {
      const names = getCoreTypeNames();
      expect(names).toHaveLength(7);
      expect(names).toContain('button');
      expect(names).toContain('custom');
    });
  });

  it('core types are immutable (frozen array)', () => {
    expect(Object.isFrozen(CORE_TYPES)).toBe(true);
  });
});
