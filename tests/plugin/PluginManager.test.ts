import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginManager } from '../../src/plugin/PluginManager';
import { PluginRegistry } from '../../src/registry/PluginRegistry';
import type { Plugin } from '../../src/registry/Plugin';
import type { PluginContext } from '../../src/plugin/types';
import type { Command } from '../../src/commands/types';
import { createEditorState } from '../../src/state/EditorState';

function makePlugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  const registry = new PluginRegistry(name);
  registry.setKey(`${name}Key`, { name });
  return { name, registry, ...overrides };
}

function makeContext(): PluginContext {
  return {
    executeCommand: vi.fn(),
    getState: () => createEditorState(),
  };
}

/** Lightweight stub — PluginManager only passes it through, no DOM API used */
function makeContainer(): Element {
  return { tagName: 'DIV' } as unknown as Element;
}

describe('PluginManager', () => {
  let ctx: PluginContext;

  beforeEach(() => {
    ctx = makeContext();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  it('creates with empty plugin list', () => {
    const pm = new PluginManager([]);
    expect(pm.getMergedCommands()).toEqual({});
  });

  // -----------------------------------------------------------------------
  // getMergedCommands
  // -----------------------------------------------------------------------

  it('merges commands from multiple plugins', () => {
    const cmdA: Command = (s) => s;
    const cmdB: Command = (s) => s;

    const pm = new PluginManager([
      makePlugin('a', { commands: { doA: cmdA } }),
      makePlugin('b', { commands: { doB: cmdB } }),
    ]);

    const merged = pm.getMergedCommands();
    expect(merged).toHaveProperty('doA', cmdA);
    expect(merged).toHaveProperty('doB', cmdB);
  });

  it('later plugin overrides command on name collision', () => {
    const first: Command = (s) => s;
    const second: Command = (s) => s;

    const pm = new PluginManager([
      makePlugin('a', { commands: { shared: first } }),
      makePlugin('b', { commands: { shared: second } }),
    ]);

    expect(pm.getMergedCommands().shared).toBe(second);
  });

  it('skips plugins without commands', () => {
    const cmd: Command = (s) => s;
    const pm = new PluginManager([
      makePlugin('no-cmds'),
      makePlugin('with-cmds', { commands: { doIt: cmd } }),
    ]);

    const merged = pm.getMergedCommands();
    expect(Object.keys(merged)).toEqual(['doIt']);
  });

  // -----------------------------------------------------------------------
  // init / destroy lifecycle
  // -----------------------------------------------------------------------

  it('init calls onInit on each plugin with context', () => {
    const initA = vi.fn();
    const initB = vi.fn();

    const pm = new PluginManager([
      makePlugin('a', { onInit: initA }),
      makePlugin('b', { onInit: initB }),
    ]);

    pm.init(ctx);

    expect(initA).toHaveBeenCalledOnce();
    expect(initA).toHaveBeenCalledWith(ctx);
    expect(initB).toHaveBeenCalledOnce();
    expect(initB).toHaveBeenCalledWith(ctx);
  });

  it('init is idempotent — second call is no-op', () => {
    const initFn = vi.fn();
    const pm = new PluginManager([makePlugin('a', { onInit: initFn })]);

    pm.init(ctx);
    pm.init(ctx);

    expect(initFn).toHaveBeenCalledOnce();
  });

  it('destroy calls onDestroy on each plugin', () => {
    const destroyA = vi.fn();
    const destroyB = vi.fn();

    const pm = new PluginManager([
      makePlugin('a', { onDestroy: destroyA }),
      makePlugin('b', { onDestroy: destroyB }),
    ]);

    pm.init(ctx);
    pm.destroy();

    expect(destroyA).toHaveBeenCalledOnce();
    expect(destroyB).toHaveBeenCalledOnce();
  });

  it('destroy is no-op if not initialized', () => {
    const destroyFn = vi.fn();
    const pm = new PluginManager([makePlugin('a', { onDestroy: destroyFn })]);

    pm.destroy();

    expect(destroyFn).not.toHaveBeenCalled();
  });

  it('after destroy, can re-init', () => {
    const initFn = vi.fn();
    const pm = new PluginManager([makePlugin('a', { onInit: initFn })]);

    pm.init(ctx);
    pm.destroy();
    pm.init(ctx);

    expect(initFn).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // runPostRender
  // -----------------------------------------------------------------------

  it('runPostRender calls onRender with container', () => {
    const renderFn = vi.fn();
    const pm = new PluginManager([makePlugin('a', { onRender: renderFn })]);
    const container = makeContainer();

    pm.runPostRender(container);

    expect(renderFn).toHaveBeenCalledOnce();
    expect(renderFn).toHaveBeenCalledWith(container);
  });

  it('runPostRender scoped passes scope and does not replace cleanup', () => {
    const cleanup = vi.fn();
    const renderFn = vi.fn().mockReturnValue(cleanup);
    const pm = new PluginManager([makePlugin('a', { onRender: renderFn })]);
    const container = makeContainer();
    const scope = { tagName: 'P' } as unknown as Element;

    pm.runPostRender(container);
    expect(cleanup).not.toHaveBeenCalled();

    pm.runPostRender(container, { scope });
    expect(cleanup).not.toHaveBeenCalled();
    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(renderFn).toHaveBeenLastCalledWith(container, { scope });

    // Next full pass still uses the cleanup from the first full pass.
    pm.runPostRender(container);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(renderFn).toHaveBeenCalledTimes(3);
  });

  it('runPostRender calls previous cleanup before re-running', () => {
    const cleanup = vi.fn();
    const renderFn = vi.fn().mockReturnValue(cleanup);
    const pm = new PluginManager([makePlugin('a', { onRender: renderFn })]);
    const container = makeContainer();

    pm.runPostRender(container);
    expect(cleanup).not.toHaveBeenCalled();

    pm.runPostRender(container);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  it('destroy runs remaining post-render cleanups', () => {
    const cleanup = vi.fn();
    const renderFn = vi.fn().mockReturnValue(cleanup);
    const pm = new PluginManager([makePlugin('a', { onRender: renderFn })]);
    const container = makeContainer();

    pm.init(ctx);
    pm.runPostRender(container);
    pm.destroy();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('skips plugins without onRender', () => {
    const renderFn = vi.fn();
    const pm = new PluginManager([
      makePlugin('no-render'),
      makePlugin('with-render', { onRender: renderFn }),
    ]);
    const container = makeContainer();

    pm.runPostRender(container);

    expect(renderFn).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // Error isolation
  // -----------------------------------------------------------------------

  it('error in onInit does not prevent other plugins from initializing', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const initB = vi.fn();

    const pm = new PluginManager([
      makePlugin('bad', {
        onInit: () => {
          throw new Error('init boom');
        },
      }),
      makePlugin('good', { onInit: initB }),
    ]);

    pm.init(ctx);

    expect(initB).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('onInit failed for "bad"'),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('error in onDestroy does not prevent other plugins from destroying', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const destroyB = vi.fn();

    const pm = new PluginManager([
      makePlugin('bad', {
        onDestroy: () => {
          throw new Error('destroy boom');
        },
      }),
      makePlugin('good', { onDestroy: destroyB }),
    ]);

    pm.init(ctx);
    pm.destroy();

    expect(destroyB).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('onDestroy failed for "bad"'),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('error in onRender does not prevent other plugins from rendering', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderB = vi.fn();

    const pm = new PluginManager([
      makePlugin('bad', {
        onRender: () => {
          throw new Error('render boom');
        },
      }),
      makePlugin('good', { onRender: renderB }),
    ]);
    const container = makeContainer();

    pm.runPostRender(container);

    expect(renderB).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('onRender failed for "bad"'),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });

  it('error in cleanup does not prevent plugin from re-rendering', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;

    const renderFn = vi.fn().mockImplementation((): (() => void) | undefined => {
      callCount++;
      if (callCount === 1) {
        return () => {
          throw new Error('cleanup boom');
        };
      }
      return undefined;
    });

    const pm = new PluginManager([makePlugin('a', { onRender: renderFn })]);
    const container = makeContainer();

    pm.runPostRender(container);
    pm.runPostRender(container);

    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('cleanup failed for "a"'),
      expect.any(Error),
    );

    errSpy.mockRestore();
  });
});
