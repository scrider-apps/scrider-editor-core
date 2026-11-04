import { describe, it, expect } from 'vitest';
import { ModuleRegistry } from '../../src/registry';

describe('ModuleRegistry', () => {
  it('has kind "module"', () => {
    const reg = new ModuleRegistry('toolbar');
    expect(reg.kind).toBe('module');
  });

  it('stores and resolves keys', () => {
    const reg = new ModuleRegistry('toolbar');
    const btn = { type: 'button', name: 'undo', command: 'undo' };
    reg.setKey('undo', btn);

    expect(reg.hasKey('undo')).toBe(true);
    expect(reg.resolveKey('undo')).toBe(btn);
    expect(reg.getKeys()).toEqual(['undo']);
  });

  it('tracks used types', () => {
    const reg = new ModuleRegistry('toolbar');
    reg.setKey('undo', { type: 'button', name: 'undo', command: 'undo' });
    reg.setKey('header', { type: 'dropdown', name: 'header', options: [] });

    const types = reg.getUsedTypes();
    expect(types).toContain('button');
    expect(types).toContain('dropdown');
  });

  it('sublimates string key to full object', () => {
    const reg = new ModuleRegistry('toolbar');
    const btn = { type: 'button', name: 'bold', command: 'toggleBold' };
    reg.setKey('bold', btn);

    expect(reg.sublimate('bold')).toBe(btn);
  });

  it('sublimates array of keys', () => {
    const reg = new ModuleRegistry('toolbar');
    const undo = { type: 'button', name: 'undo', command: 'undo' };
    const redo = { type: 'button', name: 'redo', command: 'redo' };
    reg.setKey('undo', undo);
    reg.setKey('redo', redo);

    expect(reg.sublimate(['undo', 'redo'])).toEqual([undo, redo]);
  });

  it('passes through full objects unchanged', () => {
    const reg = new ModuleRegistry('toolbar');
    const obj = { type: 'button', name: 'custom', command: 'doSomething' };
    expect(reg.sublimate(obj)).toBe(obj);
  });

  it('validates successfully against available types', () => {
    const reg = new ModuleRegistry('toolbar');
    reg.setKey('undo', { type: 'button', name: 'undo', command: 'undo' });

    const result = reg.validate(new Set(['button']), new Set());
    expect(result.ok).toBe(true);
  });

  it('fails validation on unknown type', () => {
    const reg = new ModuleRegistry('toolbar');
    reg.setKey('w', { type: 'widget', name: 'w' });

    const result = reg.validate(new Set(['button']), new Set());
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe('UNKNOWN_TYPE');
  });
});
