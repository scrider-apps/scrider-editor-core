import { describe, it, expect } from 'vitest';
import {
  BUTTON_KEYS,
  GROUP_KEYS,
  ToolbarModuleRegistry,
  compactToolbarConfig,
  defaultToolbar,
  type ToolbarConfig,
} from '../../../src';

const sayHello = {
  type: 'button' as const,
  name: 'sayHello',
  command: 'sayHello',
  icon: 'sparkles',
  tooltip: 'Say hello',
};

/** An extension item the resolver does not know, like accordion without its extension. */
const orphan = {
  type: 'button' as const,
  name: 'orphan',
  command: 'orphan',
  icon: 'orphan',
  tooltip: 'Orphan',
};

function setup(): {
  registry: ToolbarModuleRegistry;
  resolve: (input: Record<string, unknown>) => ToolbarConfig;
} {
  const registry = new ToolbarModuleRegistry();
  const globalResolve = (key: string | object): unknown =>
    key === 'sayHello' ? sayHello : undefined;
  return {
    registry,
    resolve: (input) => registry.resolveConfig(input, defaultToolbar, globalResolve),
  };
}

describe('compactToolbarConfig, group level', () => {
  it('built-in groups compact to their names and resolve back to the same config', () => {
    const { resolve } = setup();
    const full = resolve({ configuration: 'base' });
    for (const options of [{}, { resolve }]) {
      const compact = compactToolbarConfig(full, 'group', options);
      expect(compact.groups).toContain('history');
      expect(resolve({ ...compact })).toEqual(full);
    }
  });

  it('an unregistered group stays an object', () => {
    const { resolve } = setup();
    const full = resolve({ extends: 'base', groups: [{ name: 'hello', items: [sayHello] }] });
    for (const options of [{}, { resolve }]) {
      const compact = compactToolbarConfig(full, 'group', options);
      expect(compact.groups).toContainEqual({ name: 'hello', items: ['sayHello'] });
      expect(resolve({ extends: 'base', ...compact })).toEqual(full);
    }
  });

  it('a registered group compacts to its name when resolve knows it', () => {
    const { registry, resolve } = setup();
    registry.setKey('group:hello', { name: 'hello', items: ['sayHello'] });
    const full = resolve({ extends: 'base', groups: ['hello'] });

    expect(compactToolbarConfig(full, 'group').groups).not.toContain('hello');
    const compact = compactToolbarConfig(full, 'group', { resolve });
    expect(compact.groups).toContain('hello');
    expect(resolve({ extends: 'base', ...compact })).toEqual(full);
  });

  it('a group tuned by its row compacts to its name in that row', () => {
    const { resolve: base } = setup();
    const resolve = (input: Record<string, unknown>): ToolbarConfig => {
      const config = base(input);
      if (!config.groups.some((g) => g.name === 'font')) return config;
      const groups = config.groups.map((g) => (g.name === 'history' ? { ...g, priority: 3 } : g));
      return { ...config, groups };
    };
    const full = resolve({ configuration: 'base' });
    expect(full.groups.find((g) => g.name === 'history')?.priority).toBe(3);

    const compact = compactToolbarConfig(full, 'group', { resolve });
    expect(compact.groups).toContain('history');
    expect(compact.groups).toContain('font');
    expect(resolve({ ...compact })).toEqual(full);
  });

  it('a group that only resolves back with its neighbours stays an object without them', () => {
    const { resolve: base } = setup();
    const resolve = (input: Record<string, unknown>): ToolbarConfig => {
      const config = base(input);
      const groups = config.groups.map((g) =>
        g.name === 'history' && config.groups.length > 1 ? { ...g, priority: 3 } : g,
      );
      return { ...config, groups };
    };
    const full = resolve({ groups: ['history'] });
    const tuned = { groups: [{ ...full.groups[0]!, priority: 3 }] };
    const compact = compactToolbarConfig(tuned, 'group', { resolve });
    expect(compact.groups).not.toContain('history');
    expect(resolve({ ...compact })).toEqual(tuned);
  });

  it('a built-in name with other items keeps its items', () => {
    const { resolve } = setup();
    const block = { ...GROUP_KEYS.block!, items: [...GROUP_KEYS.block!.items!, sayHello] };
    const full = resolve({ extends: 'base', groups: [block] });
    for (const options of [{}, { resolve }]) {
      const compact = compactToolbarConfig(full, 'group', options);
      expect(compact.groups).not.toContain('block');
      const back = resolve({ extends: 'base', ...compact });
      expect(back.groups.find((g) => g.name === 'block')?.items).toContainEqual(sayHello);
    }
  });
});

describe('compactToolbarConfig, button level', () => {
  it('with resolve, an item that does not resolve back stays an object', () => {
    const { resolve } = setup();
    const full = resolve({
      extends: 'base',
      groups: [{ name: 'misc', items: [BUTTON_KEYS.removeFormat!, sayHello, orphan] }],
    });
    for (const level of ['button', 'group'] as const) {
      const compact = compactToolbarConfig(full, level, { resolve });
      expect(compact.groups).toContainEqual({
        name: 'misc',
        items: ['removeFormat', 'sayHello', orphan],
      });
      expect(resolve({ extends: 'base', ...compact })).toEqual(full);
    }
  });

  it('an unresolved string item is kept as is', () => {
    const config: ToolbarConfig = {
      groups: [{ name: 'misc', items: [BUTTON_KEYS.removeFormat!, 'unknownItem' as never] }],
    };
    expect(compactToolbarConfig(config, 'button').groups).toEqual([
      { name: 'misc', items: ['removeFormat', 'unknownItem'] },
    ]);
  });
});
