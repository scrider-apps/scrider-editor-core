import { describe, it, expect } from 'vitest';
import { BaseEntityRegistry } from '../../src/registry';

describe('BaseEntityRegistry', () => {
  function createRegistry(name = 'test', kind: 'module' | 'plugin' = 'module'): BaseEntityRegistry {
    return new BaseEntityRegistry(name, kind);
  }

  describe('constructor', () => {
    it('sets name and kind', () => {
      const reg = createRegistry('toolbar', 'module');
      expect(reg.name).toBe('toolbar');
      expect(reg.kind).toBe('module');
    });

    it('starts with no keys', () => {
      const reg = createRegistry();
      expect(reg.getKeys()).toEqual([]);
    });
  });

  describe('key management', () => {
    it('setKey / resolveKey round-trip', () => {
      const reg = createRegistry();
      const value = { type: 'button', name: 'undo', command: 'undo' };
      reg.setKey('undo', value);
      expect(reg.resolveKey('undo')).toBe(value);
    });

    it('hasKey returns true for registered keys', () => {
      const reg = createRegistry();
      reg.setKey('bold', { type: 'button', name: 'bold', command: 'toggleBold' });
      expect(reg.hasKey('bold')).toBe(true);
      expect(reg.hasKey('italic')).toBe(false);
    });

    it('getKeys returns all registered keys', () => {
      const reg = createRegistry();
      reg.setKey('a', 1);
      reg.setKey('b', 2);
      reg.setKey('c', 3);
      expect(reg.getKeys()).toEqual(['a', 'b', 'c']);
    });

    it('resolveKey returns undefined for unknown keys', () => {
      const reg = createRegistry();
      expect(reg.resolveKey('missing')).toBeUndefined();
    });

    it('resolveKey passthrough object input', () => {
      const reg = createRegistry();
      const inline = { type: 'button', name: 'inline' };
      expect(reg.resolveKey(inline)).toBe(inline);
    });

    it('setKey overwrites existing key', () => {
      const reg = createRegistry();
      reg.setKey('x', 1);
      reg.setKey('x', 2);
      expect(reg.resolveKey('x')).toBe(2);
    });
  });

  describe('type tracking', () => {
    it('tracks type from object with type field', () => {
      const reg = createRegistry();
      reg.setKey('undo', { type: 'button', name: 'undo' });
      expect(reg.getUsedTypes()).toContain('button');
    });

    it('tracks multiple types', () => {
      const reg = createRegistry();
      reg.setKey('undo', { type: 'button', name: 'undo' });
      reg.setKey('header', { type: 'dropdown', name: 'header', options: [] });
      const types = reg.getUsedTypes();
      expect(types).toContain('button');
      expect(types).toContain('dropdown');
    });

    it('does not track type from non-objects', () => {
      const reg = createRegistry();
      reg.setKey('label', 'just a string');
      expect(reg.getUsedTypes()).toEqual([]);
    });

    it('does not track type when type field is not a string', () => {
      const reg = createRegistry();
      reg.setKey('weird', { type: 42, name: 'weird' });
      expect(reg.getUsedTypes()).toEqual([]);
    });
  });

  describe('sublimate', () => {
    it('resolves string key to registered value', () => {
      const reg = createRegistry();
      const btn = { type: 'button', name: 'undo', command: 'undo' };
      reg.setKey('undo', btn);
      expect(reg.sublimate('undo')).toBe(btn);
    });

    it('returns string as-is if not registered', () => {
      const reg = createRegistry();
      expect(reg.sublimate('unknown')).toBe('unknown');
    });

    it('resolves array of string keys', () => {
      const reg = createRegistry();
      const undo = { type: 'button', name: 'undo' };
      const redo = { type: 'button', name: 'redo' };
      reg.setKey('undo', undo);
      reg.setKey('redo', redo);
      expect(reg.sublimate(['undo', 'redo'])).toEqual([undo, redo]);
    });

    it('passes through objects unchanged', () => {
      const reg = createRegistry();
      const obj = { type: 'button', name: 'custom', command: 'custom' };
      expect(reg.sublimate(obj)).toBe(obj);
    });

    it('handles mixed arrays (strings + objects)', () => {
      const reg = createRegistry();
      const undo = { type: 'button', name: 'undo' };
      reg.setKey('undo', undo);
      const custom = { type: 'button', name: 'custom' };
      const result = reg.sublimate(['undo', custom]);
      expect(result).toEqual([undo, custom]);
    });
  });

  describe('validate', () => {
    it('succeeds when all types are available and no key conflicts', () => {
      const reg = createRegistry();
      reg.setKey('undo', { type: 'button', name: 'undo' });

      const availableTypes = new Set(['button', 'dropdown', 'separator']);
      const registeredKeys = new Set<string>();

      const result = reg.validate(availableTypes, registeredKeys);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails when referencing unknown type', () => {
      const reg = createRegistry();
      reg.setKey('widget', { type: 'widget', name: 'w1' });

      const availableTypes = new Set(['button']);
      const registeredKeys = new Set<string>();

      const result = reg.validate(availableTypes, registeredKeys);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('UNKNOWN_TYPE');
      expect(result.errors[0]!.message).toContain('widget');
    });

    it('fails when key conflicts with already registered key', () => {
      const reg = createRegistry();
      reg.setKey('undo', { type: 'button', name: 'undo' });

      const availableTypes = new Set(['button']);
      const registeredKeys = new Set(['undo']);

      const result = reg.validate(availableTypes, registeredKeys);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.code).toBe('KEY_CONFLICT');
      expect(result.errors[0]!.message).toContain('undo');
    });

    it('reports multiple errors at once', () => {
      const reg = createRegistry();
      reg.setKey('x', { type: 'unknown1', name: 'x' });
      reg.setKey('y', { type: 'unknown2', name: 'y' });
      reg.setKey('conflict', { name: 'z' });

      const availableTypes = new Set(['button']);
      const registeredKeys = new Set(['conflict']);

      const result = reg.validate(availableTypes, registeredKeys);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('succeeds with no keys registered', () => {
      const reg = createRegistry();
      const result = reg.validate(new Set(['button']), new Set());
      expect(result.ok).toBe(true);
    });
  });
});
