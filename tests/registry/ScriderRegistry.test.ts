import { describe, it, expect } from 'vitest';
import { ScriderRegistry, ModuleRegistry, PluginRegistry } from '../../src/registry';
import type { Module, Plugin } from '../../src/registry';

function createModule(name: string, keys?: Record<string, unknown>): Module {
  const reg = new ModuleRegistry(name);
  if (keys) {
    for (const [k, v] of Object.entries(keys)) {
      reg.setKey(k, v);
    }
  }
  return { name, config: 'base', registry: reg };
}

function createPlugin(name: string, keys?: Record<string, unknown>): Plugin {
  const reg = new PluginRegistry(name);
  if (keys) {
    for (const [k, v] of Object.entries(keys)) {
      reg.setKey(k, v);
    }
  }
  return { name, registry: reg };
}

describe('ScriderRegistry', () => {
  describe('constructor', () => {
    it('initializes with core types available', () => {
      const sr = new ScriderRegistry();
      expect(sr.isTypeAvailable('button')).toBe(true);
      expect(sr.isTypeAvailable('dropdown')).toBe(true);
      expect(sr.isTypeAvailable('separator')).toBe(true);
      expect(sr.isTypeAvailable('group')).toBe(true);
      expect(sr.isTypeAvailable('color')).toBe(true);
      expect(sr.isTypeAvailable('custom')).toBe(true);
    });

    it('unknown types are not available', () => {
      const sr = new ScriderRegistry();
      expect(sr.isTypeAvailable('widget')).toBe(false);
    });

    it('starts with no modules or plugins', () => {
      const sr = new ScriderRegistry();
      expect(sr.getAvailableModules()).toEqual([]);
      expect(sr.getAvailablePlugins()).toEqual([]);
    });
  });

  describe('validateRegistry', () => {
    it('returns ok for valid registry', () => {
      const sr = new ScriderRegistry();
      const reg = new ModuleRegistry('toolbar');
      reg.setKey('undo', { type: 'button', name: 'undo', command: 'undo' });

      const result = sr.validateRegistry(reg);
      expect(result.ok).toBe(true);
    });

    it('returns error for registry with unknown type', () => {
      const sr = new ScriderRegistry();
      const reg = new ModuleRegistry('bad');
      reg.setKey('w', { type: 'widget', name: 'w' });

      const result = sr.validateRegistry(reg);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_TYPE')).toBe(true);
    });

    it('does not mutate state — module not registered', () => {
      const sr = new ScriderRegistry();
      const reg = new ModuleRegistry('toolbar');
      reg.setKey('undo', { type: 'button', name: 'undo', command: 'undo' });

      sr.validateRegistry(reg);

      expect(sr.getRegistry('toolbar')).toBeUndefined();
      expect(sr.getAvailableModules()).toEqual([]);
      expect(sr.hasKey('undo')).toBe(false);
    });

    it('does not mutate state — keys not tracked', () => {
      const sr = new ScriderRegistry();
      const reg1 = new ModuleRegistry('first');
      reg1.setKey('shared', { type: 'button', name: 'shared', command: 'x' });
      sr.validateRegistry(reg1);

      const reg2 = new ModuleRegistry('second');
      reg2.setKey('shared', { type: 'button', name: 'shared', command: 'y' });
      const result = sr.validateRegistry(reg2);
      expect(result.ok).toBe(true);
    });
  });

  describe('registerModule', () => {
    it('atomically validates and registers module', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('toolbar', {
        undo: { type: 'button', name: 'undo', command: 'undo' },
      });

      const result = sr.registerModule(mod);
      expect(result.ok).toBe(true);
      expect(sr.getAvailableModules()).toEqual(['toolbar']);
      expect(sr.getModule('toolbar')).toBe(mod);
      expect(sr.getRegistry('toolbar')).toBe(mod.registry);
      expect(sr.hasKey('undo')).toBe(true);
    });

    it('rejects module with unknown type — nothing registered', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('bad', {
        w: { type: 'widget', name: 'w' },
      });

      const result = sr.registerModule(mod);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_TYPE')).toBe(true);
      expect(sr.getAvailableModules()).toEqual([]);
      expect(sr.getRegistry('bad')).toBeUndefined();
      expect(sr.hasKey('w')).toBe(false);
    });

    it('rejects module with conflicting keys', () => {
      const sr = new ScriderRegistry();
      const mod1 = createModule('first', {
        shared: { type: 'button', name: 'shared', command: 'x' },
      });
      sr.registerModule(mod1);

      const mod2 = createModule('second', {
        shared: { type: 'button', name: 'shared', command: 'y' },
      });
      const result = sr.registerModule(mod2);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === 'KEY_CONFLICT')).toBe(true);
    });

    it('rejects module with duplicate registry name', () => {
      const sr = new ScriderRegistry();
      const mod1 = createModule('first', {
        a: { type: 'button', name: 'a', command: 'a' },
      });
      sr.registerModule(mod1);

      const mod2 = createModule('first', {
        b: { type: 'button', name: 'b', command: 'b' },
      });
      const result = sr.registerModule(mod2);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({ code: 'DUPLICATE_NAME' });
    });

    it('tracks keys from registered modules', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('toolbar', {
        undo: { type: 'button', name: 'undo', command: 'undo' },
      });
      sr.registerModule(mod);

      expect(sr.hasKey('undo')).toBe(true);
      expect(sr.hasKey('redo')).toBe(false);
    });
  });

  describe('registerPlugin', () => {
    it('atomically validates and registers plugin', () => {
      const sr = new ScriderRegistry();
      const plug = createPlugin('export-pdf', {
        exportPdf: { name: 'exportPdf' },
      });

      const result = sr.registerPlugin(plug);
      expect(result.ok).toBe(true);
      expect(sr.getAvailablePlugins()).toEqual(['export-pdf']);
      expect(sr.getPlugin('export-pdf')).toBe(plug);
      expect(sr.getRegistry('export-pdf')).toBe(plug.registry);
    });

    it('rejects plugin with duplicate registry name (same kind)', () => {
      const sr = new ScriderRegistry();
      const plug1 = createPlugin('shared-name', {
        a: { name: 'a' },
      });
      sr.registerPlugin(plug1);

      const plug2 = createPlugin('shared-name', {
        b: { name: 'b' },
      });
      const result = sr.registerPlugin(plug2);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({ code: 'DUPLICATE_NAME' });
      expect(sr.getAvailablePlugins()).toEqual(['shared-name']);
    });

    it('allows same name for module and plugin (different kind)', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('toolbar-item', {
        customAction: { type: 'button', name: 'customAction', command: 'customAction' },
      });
      sr.registerModule(mod);

      const plug = createPlugin('toolbar-item', {
        'cmd:customAction': { command: 'customAction' },
      });
      const result = sr.registerPlugin(plug);
      expect(result.ok).toBe(true);
      expect(sr.getAvailableModules()).toEqual(['toolbar-item']);
      expect(sr.getAvailablePlugins()).toEqual(['toolbar-item']);
      expect(sr.getRegistry('toolbar-item', 'module')).toBe(mod.registry);
      expect(sr.getRegistry('toolbar-item', 'plugin')).toBe(plug.registry);
    });

    it('rejects plugin with conflicting keys — nothing registered', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('toolbar', {
        shared: { type: 'button', name: 'shared', command: 'x' },
      });
      sr.registerModule(mod);

      const plug = createPlugin('bad-plugin', {
        shared: { name: 'shared' },
      });
      const result = sr.registerPlugin(plug);
      expect(result.ok).toBe(false);
      expect(sr.getAvailablePlugins()).toEqual([]);
    });
  });

  describe('resolveKey', () => {
    it('resolves key from registered module', () => {
      const sr = new ScriderRegistry();
      const btn = { type: 'button', name: 'undo', command: 'undo' };
      const mod = createModule('toolbar', { undo: btn });
      sr.registerModule(mod);

      expect(sr.resolveKey('undo')).toBe(btn);
    });

    it('returns undefined for unknown key', () => {
      const sr = new ScriderRegistry();
      expect(sr.resolveKey('missing')).toBeUndefined();
    });

    it('resolves from first registry that has the key', () => {
      const sr = new ScriderRegistry();
      const val1 = { type: 'button', name: 'x', command: 'x1' };
      const mod = createModule('first', { x: val1 });
      sr.registerModule(mod);

      expect(sr.resolveKey('x')).toBe(val1);
    });

    it('passthrough object input unchanged', () => {
      const sr = new ScriderRegistry();
      const inline = { type: 'button', name: 'custom', command: 'toggleBold' };
      expect(sr.resolveKey(inline)).toBe(inline);
    });

    it('passthrough object without name (validation is consumer-side)', () => {
      const sr = new ScriderRegistry();
      const partial = { type: 'button', command: 'undo' };
      expect(sr.resolveKey(partial)).toBe(partial);
    });
  });

  describe('registerSchema', () => {
    it('rejects duplicate format registration', () => {
      const sr = new ScriderRegistry();
      const fmt = sr.formatRegistry.get('bold');
      expect(fmt).toBeDefined();
      const result = sr.registerSchema({ kind: 'format', format: fmt! });
      expect(result.ok).toBe(false);
      expect(result.errors[0]?.code).toBe('REGISTER_SCHEMA_FAILED');
    });

    it('rejects duplicate schema key on second registerSchema call', () => {
      const sr = new ScriderRegistry();
      const custom = {
        name: 'customTestFmt',
        scope: 'inline' as const,
        normalize: (v: unknown): unknown => v,
        validate: (): boolean => true,
        sanitize: (v: unknown): unknown => v,
      };
      const first = sr.registerSchema({ kind: 'format', format: custom });
      expect(first.ok).toBe(true);
      const second = sr.registerSchema({ kind: 'format', format: custom });
      expect(second.ok).toBe(false);
      expect(second.errors[0]?.code).toBe('DUPLICATE_SCHEMA');
    });
  });

  describe('integration: full cycle', () => {
    it('registerModule → registerPlugin → queries', () => {
      const sr = new ScriderRegistry();

      const toolbarMod = createModule('toolbar', {
        bold: { type: 'button', name: 'bold', command: 'toggleBold' },
        italic: { type: 'button', name: 'italic', command: 'toggleItalic' },
      });
      expect(sr.registerModule(toolbarMod).ok).toBe(true);

      const prismPlug = createPlugin('prism');
      expect(sr.registerPlugin(prismPlug).ok).toBe(true);

      expect(sr.getAvailableModules()).toEqual(['toolbar']);
      expect(sr.getAvailablePlugins()).toEqual(['prism']);
      expect(sr.hasKey('bold')).toBe(true);
      expect(sr.hasKey('italic')).toBe(true);
      expect(sr.resolveKey('bold')).toEqual({
        type: 'button',
        name: 'bold',
        command: 'toggleBold',
      });
    });

    it('module with invalid registry — nothing registered', () => {
      const sr = new ScriderRegistry();
      const mod = createModule('toolbar', {
        w: { type: 'widget', name: 'w' },
      });

      expect(sr.registerModule(mod).ok).toBe(false);
      expect(sr.getAvailableModules()).toEqual([]);
      expect(sr.getRegistry('toolbar')).toBeUndefined();
    });
  });
});
