import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../../src/registry';

describe('PluginRegistry', () => {
  it('has kind "plugin"', () => {
    const reg = new PluginRegistry('export-pdf');
    expect(reg.kind).toBe('plugin');
  });

  it('stores and resolves keys', () => {
    const reg = new PluginRegistry('export-pdf');
    const cmd = { name: 'exportPdf', handler: 'exportPdfHandler' };
    reg.setKey('exportPdf', cmd);

    expect(reg.hasKey('exportPdf')).toBe(true);
    expect(reg.resolveKey('exportPdf')).toBe(cmd);
    expect(reg.getKeys()).toEqual(['exportPdf']);
  });

  it('sublimates string key', () => {
    const reg = new PluginRegistry('prism');
    const val = { name: 'highlight', onRender: true };
    reg.setKey('highlight', val);

    expect(reg.sublimate('highlight')).toBe(val);
  });

  it('validates with no used types (no type field on entries)', () => {
    const reg = new PluginRegistry('export-pdf');
    reg.setKey('exportPdf', { name: 'exportPdf', handler: 'fn' });

    const result = reg.validate(new Set(['button']), new Set());
    expect(result.ok).toBe(true);
  });

  it('detects key conflict', () => {
    const reg = new PluginRegistry('export-pdf');
    reg.setKey('shared', { name: 'shared' });

    const result = reg.validate(new Set(), new Set(['shared']));
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe('KEY_CONFLICT');
  });
});
