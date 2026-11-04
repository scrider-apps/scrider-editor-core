import { describe, it, expect } from 'vitest';
import { ScriderRegistry, ModuleRegistry, PluginRegistry } from '../../src/registry';
import type { Module, Plugin } from '../../src/registry';

describe('Module & Plugin with ScriderRegistry', () => {
  it('module registers atomically with its ModuleRegistry', () => {
    const sr = new ScriderRegistry();
    const reg = new ModuleRegistry('toolbar');
    reg.setKey('undo', { type: 'button', name: 'undo', command: 'undo' });

    const mod: Module = { name: 'toolbar', config: 'base', registry: reg };
    const result = sr.registerModule(mod);

    expect(result.ok).toBe(true);
    expect(sr.getAvailableModules()).toContain('toolbar');
    expect(sr.getRegistry('toolbar')).toBe(reg);
  });

  it('plugin registers atomically with its PluginRegistry', () => {
    const sr = new ScriderRegistry();
    const reg = new PluginRegistry('export-pdf');
    reg.setKey('exportPdf', { name: 'exportPdf' });

    const plug: Plugin = { name: 'export-pdf', registry: reg };
    const result = sr.registerPlugin(plug);

    expect(result.ok).toBe(true);
    expect(sr.getAvailablePlugins()).toContain('export-pdf');
    expect(sr.getRegistry('export-pdf')).toBe(reg);
  });

  it('module with invalid registry — nothing registered', () => {
    const sr = new ScriderRegistry();
    const reg = new ModuleRegistry('bad');
    reg.setKey('w', { type: 'widget', name: 'w' });

    const mod: Module = { name: 'bad', config: 'base', registry: reg };
    const result = sr.registerModule(mod);

    expect(result.ok).toBe(false);
    expect(sr.getAvailableModules()).toEqual([]);
    expect(sr.getRegistry('bad')).toBeUndefined();
  });

  it('full cycle: module + plugin coexist', () => {
    const sr = new ScriderRegistry();

    const toolbarReg = new ModuleRegistry('toolbar');
    toolbarReg.setKey('bold', { type: 'button', name: 'bold', command: 'toggleBold' });
    const toolbarMod: Module = { name: 'toolbar', config: 'base', registry: toolbarReg };
    sr.registerModule(toolbarMod);

    const pdfReg = new PluginRegistry('export-pdf');
    pdfReg.setKey('exportPdf', { name: 'exportPdf' });
    const pdfPlug: Plugin = { name: 'export-pdf', registry: pdfReg };
    sr.registerPlugin(pdfPlug);

    expect(sr.getAvailableModules()).toEqual(['toolbar']);
    expect(sr.getAvailablePlugins()).toEqual(['export-pdf']);
    expect(sr.hasKey('bold')).toBe(true);
    expect(sr.hasKey('exportPdf')).toBe(true);
    expect(sr.resolveKey('bold')).toEqual({ type: 'button', name: 'bold', command: 'toggleBold' });
    expect(sr.resolveKey('exportPdf')).toEqual({ name: 'exportPdf' });
  });
});
