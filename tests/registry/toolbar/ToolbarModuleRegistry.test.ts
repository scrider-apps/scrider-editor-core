import { describe, it, expect } from 'vitest';
import { ToolbarModuleRegistry } from '../../../src/registry/modules/toolbar/ToolbarModuleRegistry';
import { BUTTON_KEYS, GROUP_KEYS } from '../../../src/registry/modules/toolbar/toolbarKeys';
import { defaultToolbar } from '../../../src/registry/modules/toolbar/defaultToolbar';
import type { ToolbarGroup } from '../../../src/registry/modules/toolbar/types';

/**
 * Resolved toolbar items asserted in these tests are always "named" controls
 * (buttons/dropdowns/etc.), never bare separators, so narrow the ToolbarItem
 * union to a shape with the fields the assertions read.
 */
type NamedItem = { type: string; name: string; tooltip?: string; command?: string };
const at = (group: ToolbarGroup | undefined, i: number): NamedItem => group!.items![i] as NamedItem;

describe('ToolbarModuleRegistry', () => {
  function create(): ToolbarModuleRegistry {
    return new ToolbarModuleRegistry();
  }

  describe('constructor', () => {
    it('creates with name "toolbar" and kind "module"', () => {
      const reg = create();
      expect(reg.name).toBe('toolbar');
      expect(reg.kind).toBe('module');
    });

    it('registers all button keys', () => {
      const reg = create();
      for (const key of Object.keys(BUTTON_KEYS)) {
        expect(reg.hasKey(key)).toBe(true);
      }
    });

    it('registers all group keys with "group:" prefix', () => {
      const reg = create();
      for (const key of Object.keys(GROUP_KEYS)) {
        expect(reg.hasKey(`group:${key}`)).toBe(true);
      }
    });
  });

  describe('sublimate', () => {
    it('resolves button string to full object', () => {
      const reg = create();
      const result = reg.sublimate('undo');
      expect(result).toEqual(BUTTON_KEYS.undo);
    });

    it('resolves group string to full object', () => {
      const reg = create();
      const result = reg.sublimate('history');
      expect(result).toEqual(GROUP_KEYS.history);
    });

    it('passes through unknown string unchanged', () => {
      const reg = create();
      expect(reg.sublimate('nonexistent')).toBe('nonexistent');
    });

    it('resolves array of strings', () => {
      const reg = create();
      const result = reg.sublimate(['undo', 'redo']) as unknown[];
      expect(result).toEqual([BUTTON_KEYS.undo, BUTTON_KEYS.redo]);
    });

    it('passes through objects unchanged', () => {
      const reg = create();
      const obj = { type: 'button', name: 'custom', command: 'noop' };
      expect(reg.sublimate(obj)).toBe(obj);
    });
  });

  describe('resolveConfig', () => {
    it('resolves base mode — uses defaults when no overrides', () => {
      const reg = create();
      const result = reg.resolveConfig({ configuration: 'base' }, defaultToolbar);
      expect(result.groups.length).toBe(defaultToolbar.groups.length);
      expect(result.groups[0]!.name).toBe('history');
    });

    it('base mode — overrides a group by name', () => {
      const reg = create();
      const customHistory: ToolbarGroup = {
        name: 'history',
        priority: 1,
        items: [BUTTON_KEYS.undo!],
      };
      const result = reg.resolveConfig(
        { configuration: 'base', groups: [customHistory] },
        defaultToolbar,
      );
      const historyGroup = result.groups.find((g) => g.name === 'history');
      expect(historyGroup).toBeDefined();
      expect(historyGroup!.items).toHaveLength(1);
    });

    it('base mode — adds new group', () => {
      const reg = create();
      const custom: ToolbarGroup = {
        name: 'myCustom',
        items: [BUTTON_KEYS.bold!],
      };
      const result = reg.resolveConfig({ configuration: 'base', groups: [custom] }, defaultToolbar);
      expect(result.groups.some((g) => g.name === 'myCustom')).toBe(true);
    });

    it('raw mode — builds config from scratch', () => {
      const reg = create();
      const raw: ToolbarGroup = {
        name: 'only',
        items: [BUTTON_KEYS.bold!, BUTTON_KEYS.italic!],
      };
      const result = reg.resolveConfig({ groups: [raw] }, defaultToolbar);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.name).toBe('only');
    });

    it('parses overflow and settings', () => {
      const reg = create();
      const overflow: ToolbarGroup = { name: 'ov', items: [BUTTON_KEYS.subscript!] };
      const settings: ToolbarGroup = {
        type: 'group',
        name: 'set',
        control: { type: 'button', name: 'set', icon: 'gear' },
      };
      const result = reg.resolveConfig(
        { groups: [], overflow: [overflow], settings: [settings] },
        defaultToolbar,
      );
      expect(result.overflow).toHaveLength(1);
      expect(result.settings).toHaveLength(1);
    });

    it('parses customBlocks from extra root keys', () => {
      const reg = create();
      const panel: ToolbarGroup = { name: 'p', items: [BUTTON_KEYS.bold!] };
      const result = reg.resolveConfig({ groups: [], myPanel: [panel] }, defaultToolbar);
      expect(result.customBlocks).toBeDefined();
      expect(result.customBlocks!['myPanel']).toHaveLength(1);
    });

    it('throws on invalid group object', () => {
      const reg = create();
      expect(() => reg.resolveConfig({ groups: [{ type: 'invalid' }] }, defaultToolbar)).toThrow(
        'Invalid group',
      );
    });
  });

  describe('extends merge', () => {
    it('group extends: "base" — only priority changes, items from base', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          extends: 'base',
          groups: [{ name: 'history', extends: 'base', priority: 10 }],
        },
        defaultToolbar,
      );
      const history = result.groups.find((g) => g.name === 'history');
      expect(history).toBeDefined();
      expect(history!.priority).toBe(10);
      expect(history!.items).toHaveLength(2);
      expect(at(history, 0).name).toBe('undo');
      expect(at(history, 1).name).toBe('redo');
    });

    it('item extends: "base" — only tooltip changes, type/command from base', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          groups: [
            {
              name: 'test',
              items: [{ name: 'bold', extends: 'base', tooltip: 'BOLD!!!' }],
            },
          ],
        },
        defaultToolbar,
      );
      const group = result.groups.find((g) => g.name === 'test');
      const bold = group!.items![0]! as NamedItem;
      expect(bold.type).toBe('button');
      expect((bold as { command: string }).command).toBe('toggleBold');
      expect(bold.tooltip).toBe('BOLD!!!');
    });

    it('item extends: "base" with mismatched type — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [
              {
                name: 'test',
                items: [{ name: 'bold', extends: 'base', type: 'dropdown' }],
              },
            ],
          },
          defaultToolbar,
        ),
      ).toThrow(/Type mismatch.*bold.*button.*dropdown/);
    });

    it('item extends: "base" without type — type from base', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          groups: [{ name: 'test', items: [{ name: 'strike', extends: 'base' }] }],
        },
        defaultToolbar,
      );
      const item = result.groups[0]!.items![0]! as NamedItem;
      expect(item.type).toBe('button');
      expect(item.name).toBe('strike');
      expect((item as { command: string }).command).toBe('toggleStrike');
    });

    it('extends: "unknown" at root — throws', () => {
      const reg = create();
      expect(() => reg.resolveConfig({ extends: 'unknown' }, defaultToolbar)).toThrow(
        /Invalid extends.*unknown.*only "base"/,
      );
    });

    it('extends: "unknown" on group — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig({ groups: [{ name: 'history', extends: 'unknown' }] }, defaultToolbar),
      ).toThrow(/Invalid extends.*unknown.*only "base"/);
    });

    it('extends: "" (empty string) on group — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig({ groups: [{ name: 'history', extends: '' }] }, defaultToolbar),
      ).toThrow(/Invalid extends.*only "base"/);
    });

    it('extends: "" (empty string) on item — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [{ name: 'test', items: [{ name: 'bold', extends: '' }] }],
          },
          defaultToolbar,
        ),
      ).toThrow(/Invalid extends.*only "base"/);
    });

    it('extends: "unknown" on item — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [{ name: 'test', items: [{ name: 'bold', extends: 'unknown' }] }],
          },
          defaultToolbar,
        ),
      ).toThrow(/Invalid extends.*unknown.*only "base"/);
    });

    it('CRUD delete: base item absent from items → removed', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          extends: 'base',
          groups: [
            {
              name: 'history',
              extends: 'base',
              items: [{ name: 'redo', extends: 'base', tooltip: 'Redo!' }],
            },
          ],
        },
        defaultToolbar,
      );
      const history = result.groups.find((g) => g.name === 'history');
      expect(history!.items).toHaveLength(1);
      expect(at(history, 0).name).toBe('redo');
      expect(at(history, 0).tooltip).toBe('Redo!');
    });

    it('CRUD create: new item appended after base items', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          extends: 'base',
          groups: [
            {
              name: 'history',
              extends: 'base',
              items: [
                'undo',
                'redo',
                { type: 'button', name: 'myBtn', command: 'noop', tooltip: 'My' },
              ],
            },
          ],
        },
        defaultToolbar,
      );
      const history = result.groups.find((g) => g.name === 'history');
      expect(history!.items).toHaveLength(3);
      expect(at(history, 0).name).toBe('undo');
      expect(at(history, 1).name).toBe('redo');
      expect(at(history, 2).name).toBe('myBtn');
    });

    it('unknown field on group → throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          { groups: [{ name: 'test', items: [BUTTON_KEYS.bold!], foo: 123 }] },
          defaultToolbar,
        ),
      ).toThrow(/Unknown field "foo" in group "test"/);
    });

    it('unknown field on item (typo "extens") → throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [
              {
                name: 'test',
                items: [{ type: 'button', name: 'bold', command: 'toggleBold', extens: '' }],
              },
            ],
          },
          defaultToolbar,
        ),
      ).toThrow(/Unknown field "extens" in item "bold"/);
    });

    it('unknown field on item with extends → throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [{ name: 'test', items: [{ name: 'bold', extends: 'base', foo: 1 }] }],
          },
          defaultToolbar,
        ),
      ).toThrow(/Unknown field "foo" in item "bold"/);
    });

    it('duplicate group name → throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [
              { name: 'dup', items: [BUTTON_KEYS.bold!] },
              { name: 'dup', items: [BUTTON_KEYS.italic!] },
            ],
          },
          defaultToolbar,
        ),
      ).toThrow(/Duplicate group name "dup"/);
    });

    it('duplicate item name in group → throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [{ name: 'test', items: [BUTTON_KEYS.bold!, BUTTON_KEYS.bold!] }],
          },
          defaultToolbar,
        ),
      ).toThrow(/Duplicate item name "bold"/);
    });

    it('extends at root uses "extends" field (same as "configuration")', () => {
      const reg = create();
      const result = reg.resolveConfig({ extends: 'base' }, defaultToolbar);
      expect(result.groups.length).toBe(defaultToolbar.groups.length);
      expect(result.groups[0]!.name).toBe('history');
    });

    it('integration: extends at multiple levels', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          extends: 'base',
          groups: [
            { name: 'history', extends: 'base', priority: 10 },
            {
              name: 'inline',
              items: [
                { name: 'bold', extends: 'base', tooltip: 'Bold!!!' },
                { name: 'italic', extends: 'base' },
              ],
            },
          ],
        },
        defaultToolbar,
      );

      const history = result.groups.find((g) => g.name === 'history');
      expect(history!.priority).toBe(10);
      expect(history!.items).toHaveLength(2);

      const inline = result.groups.find((g) => g.name === 'inline');
      expect(inline!.items).toHaveLength(2);
      expect(at(inline, 0).name).toBe('bold');
      expect(at(inline, 0).tooltip).toBe('Bold!!!');
      expect(at(inline, 1).name).toBe('italic');

      expect(result.groups.some((g) => g.name === 'misc')).toBe(true);
      expect(result.groups.some((g) => g.name === 'color')).toBe(true);
    });

    it('group extends unknown group name — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig({ groups: [{ name: 'nonexistent', extends: 'base' }] }, defaultToolbar),
      ).toThrow(/Cannot extend: unknown group "nonexistent"/);
    });

    it('item extends unknown item name — throws', () => {
      const reg = create();
      expect(() =>
        reg.resolveConfig(
          {
            groups: [{ name: 'test', items: [{ name: 'nonexistent', extends: 'base' }] }],
          },
          defaultToolbar,
        ),
      ).toThrow(/Cannot extend: unknown item "nonexistent"/);
    });

    it('item extends with matching type — ok', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          groups: [
            {
              name: 'test',
              items: [{ name: 'bold', extends: 'base', type: 'button', tooltip: 'B!' }],
            },
          ],
        },
        defaultToolbar,
      );
      const item = result.groups[0]!.items![0]! as NamedItem;
      expect(item.type).toBe('button');
      expect(item.tooltip).toBe('B!');
    });

    it('CRUD preserves base order for matched items', () => {
      const reg = create();
      const result = reg.resolveConfig(
        {
          extends: 'base',
          groups: [
            {
              name: 'inline',
              extends: 'base',
              items: [
                { name: 'strike', extends: 'base' },
                { name: 'bold', extends: 'base' },
              ],
            },
          ],
        },
        defaultToolbar,
      );
      const inline = result.groups.find((g) => g.name === 'inline');
      expect(at(inline, 0).name).toBe('bold');
      expect(at(inline, 1).name).toBe('strike');
    });
  });
});

describe('resolveConfig with globalResolve', () => {
  function create(): ToolbarModuleRegistry {
    return new ToolbarModuleRegistry();
  }

  const externalItem = {
    type: 'button' as const,
    name: 'externalAction',
    command: 'runExternal',
    icon: 'external',
    tooltip: 'External action',
  };

  const globalResolve = (key: string | object): unknown => {
    if (key === 'externalAction') return externalItem;
    return undefined;
  };

  it('resolves unknown item key via globalResolve fallback', () => {
    const reg = create();
    const result = reg.resolveConfig(
      {
        groups: [{ name: 'mixed', items: ['undo', 'externalAction'] }],
      },
      defaultToolbar,
      globalResolve,
    );
    const group = result.groups.find((g) => g.name === 'mixed');
    expect(group!.items).toHaveLength(2);
    expect(at(group, 0).name).toBe('undo');
    expect(at(group, 1).name).toBe('externalAction');
    expect((group!.items![1]! as { command: string }).command).toBe('runExternal');
  });

  it('local keys take priority over globalResolve', () => {
    const reg = create();
    const shadowResolve = (key: string | object): unknown => {
      if (key === 'bold') return { type: 'button', name: 'bold', command: 'shadowBold' };
      return undefined;
    };
    const result = reg.resolveConfig(
      { groups: [{ name: 'test', items: ['bold'] }] },
      defaultToolbar,
      shadowResolve,
    );
    const bold = result.groups[0]!.items![0]!;
    expect((bold as { command: string }).command).toBe('toggleBold');
  });

  it('without globalResolve, unknown string key in CRUD throws', () => {
    const reg = create();
    expect(() =>
      reg.resolveConfig(
        {
          extends: 'base',
          groups: [{ name: 'history', extends: 'base', items: ['undo', 'unknownKey'] }],
        },
        defaultToolbar,
      ),
    ).toThrow(/Unknown item key "unknownKey"/);
  });

  it('globalResolve returning undefined in CRUD — throws', () => {
    const reg = create();
    const emptyResolve = (): undefined => undefined;
    expect(() =>
      reg.resolveConfig(
        {
          extends: 'base',
          groups: [{ name: 'history', extends: 'base', items: ['undo', 'ghost'] }],
        },
        defaultToolbar,
        emptyResolve,
      ),
    ).toThrow(/Unknown item key "ghost"/);
  });

  it('extends: "base" with external items in CRUD', () => {
    const reg = create();
    const result = reg.resolveConfig(
      {
        extends: 'base',
        groups: [
          {
            name: 'history',
            extends: 'base',
            items: ['undo', 'redo', 'externalAction'],
          },
        ],
      },
      defaultToolbar,
      globalResolve,
    );
    const history = result.groups.find((g) => g.name === 'history');
    expect(history!.items).toHaveLength(3);
    expect(at(history, 0).name).toBe('undo');
    expect(at(history, 1).name).toBe('redo');
    expect(at(history, 2).name).toBe('externalAction');
  });

  it('item extends: "base" resolves external item via globalResolve', () => {
    const reg = create();
    const result = reg.resolveConfig(
      {
        groups: [
          {
            name: 'test',
            items: [{ name: 'externalAction', extends: 'base', tooltip: 'Patched!' }],
          },
        ],
      },
      defaultToolbar,
      globalResolve,
    );
    const item = result.groups[0]!.items![0]! as NamedItem;
    expect(item.name).toBe('externalAction');
    expect(item.tooltip).toBe('Patched!');
    expect((item as { command: string }).command).toBe('runExternal');
  });
});

describe('defaultToolbar', () => {
  it('has all standard groups', () => {
    const names = defaultToolbar.groups.map((g) => g.name);
    expect(names).toContain('history');
    expect(names).toContain('inline');
    expect(names).toContain('misc');
  });

  it('has overflow and settings', () => {
    expect(defaultToolbar.overflow).toBeDefined();
    expect(defaultToolbar.overflow!.length).toBeGreaterThan(0);
    expect(defaultToolbar.settings).toBeDefined();
    expect(defaultToolbar.settings!.length).toBeGreaterThan(0);
  });

  it('undo button has disabledWhen cannotUndo', () => {
    const historyGroup = defaultToolbar.groups.find((g) => g.name === 'history');
    expect(historyGroup).toBeDefined();
    const undo = historyGroup!.items!.find((i) => 'name' in i && i.name === 'undo');
    expect(undo).toBeDefined();
    expect((undo as { disabledWhen?: string }).disabledWhen).toBe('cannotUndo');
  });

  it('redo button has disabledWhen cannotRedo', () => {
    const historyGroup = defaultToolbar.groups.find((g) => g.name === 'history');
    const redo = historyGroup!.items!.find((i) => 'name' in i && i.name === 'redo');
    expect(redo).toBeDefined();
    expect((redo as { disabledWhen?: string }).disabledWhen).toBe('cannotRedo');
  });

  it('bold button does NOT have disabledWhen', () => {
    const inlineGroup = defaultToolbar.groups.find((g) => g.name === 'inline');
    const bold = inlineGroup!.items!.find((i) => 'name' in i && i.name === 'bold');
    expect((bold as { disabledWhen?: string }).disabledWhen).toBeUndefined();
  });
});

describe('setKey validation', () => {
  function create(): ToolbarModuleRegistry {
    return new ToolbarModuleRegistry();
  }

  describe('key prefix', () => {
    it('accepts group: prefix', () => {
      const reg = create();
      expect(() => reg.setKey('group:export', { name: 'export', items: [] })).not.toThrow();
    });

    it('rejects unknown prefix', () => {
      const reg = create();
      expect(() => reg.setKey('grp:foo', { name: 'foo' })).toThrow(/unknown prefix/i);
    });

    it('rejects non-ASCII prefix', () => {
      const reg = create();
      expect(() => reg.setKey('grüppe:tëst', { name: 'tëst' })).toThrow(/unknown prefix/i);
    });
  });

  describe('name validation', () => {
    it('accepts alphanumeric with hyphens', () => {
      const reg = create();
      expect(() => reg.setKey('group:my-group-1', { name: 'my-group-1', items: [] })).not.toThrow();
    });

    it('rejects name starting with digit', () => {
      const reg = create();
      expect(() => reg.setKey('group:1bad', { name: '1bad' })).toThrow(/must start with a letter/);
    });

    it('rejects special characters in name', () => {
      const reg = create();
      expect(() => reg.setKey('group:my group', { name: 'my group' })).toThrow(
        /must start with a letter/,
      );
    });

    it('rejects non-ASCII name', () => {
      const reg = create();
      expect(() => reg.setKey('group:ñame', { name: 'ñame' })).toThrow(/must start with a letter/);
    });
  });

  describe('group shape', () => {
    it('rejects array as group value', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', [])).toThrow(/plain object/);
    });

    it('rejects null as group value', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', null)).toThrow(/plain object/);
    });

    it('rejects empty object (no name)', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', {})).toThrow(/must have a string "name"/);
    });

    it('rejects object with only name — no type and no items', () => {
      const reg = create();
      expect(() => reg.setKey('group:bare', { name: 'bare' })).toThrow(
        /must have either type: "group" or an "items" array/,
      );
    });

    it('rejects wrong type field', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', { name: 'bad', type: 'button' })).toThrow(
        /must be "group"/,
      );
    });

    it('rejects name mismatch', () => {
      const reg = create();
      expect(() => reg.setKey('group:export', { name: 'other', items: [] })).toThrow(
        /doesn't match/,
      );
    });

    it('rejects items as non-array', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', { name: 'bad', items: 'not-array' })).toThrow(
        /"items" must be an array/,
      );
    });

    it('rejects unknown fields', () => {
      const reg = create();
      expect(() => reg.setKey('group:bad', { name: 'bad', items: [], foo: 'bar' })).toThrow(
        /Unknown field "foo"/,
      );
    });

    it('accepts group with type: group explicitly', () => {
      const reg = create();
      expect(() => reg.setKey('group:typed', { type: 'group', name: 'typed' })).not.toThrow();
    });

    it('accepts group with empty items', () => {
      const reg = create();
      expect(() => reg.setKey('group:empty', { name: 'empty', items: [] })).not.toThrow();
    });

    it('accepts group with priority and order', () => {
      const reg = create();
      expect(() =>
        reg.setKey('group:full', { name: 'full', priority: 99, order: 1, items: [] }),
      ).not.toThrow();
    });
  });

  describe('item shape', () => {
    it('rejects item without type', () => {
      const reg = create();
      expect(() => reg.setKey('myBtn', { name: 'myBtn', command: 'doStuff' })).toThrow(
        /must have a string "type"/,
      );
    });

    it('rejects unknown item type', () => {
      const reg = create();
      expect(() => reg.setKey('myBtn', { type: 'widget', name: 'myBtn' })).toThrow(
        /unknown item type/,
      );
    });

    it('rejects name mismatch for item', () => {
      const reg = create();
      expect(() => reg.setKey('myBtn', { type: 'button', name: 'other', command: 'x' })).toThrow(
        /doesn't match/,
      );
    });

    it('rejects unknown fields on button', () => {
      const reg = create();
      expect(() =>
        reg.setKey('myBtn', { type: 'button', name: 'myBtn', command: 'x', foo: 1 }),
      ).toThrow(/Unknown field "foo"/);
    });

    it('accepts valid button', () => {
      const reg = create();
      expect(() =>
        reg.setKey('myBtn', { type: 'button', name: 'myBtn', command: 'x', icon: 'zap' }),
      ).not.toThrow();
    });

    it('accepts valid dropdown', () => {
      const reg = create();
      expect(() =>
        reg.setKey('myDd', { type: 'dropdown', name: 'myDd', icon: 'list', options: [] }),
      ).not.toThrow();
    });

    it('accepts dropdown widthHint presets and px; rejects unknown preset', () => {
      const reg = create();
      expect(() =>
        reg.setKey('wWide', {
          type: 'dropdown',
          name: 'wWide',
          options: [],
          widthHint: 'established-wide',
        }),
      ).not.toThrow();
      expect(() =>
        reg.setKey('wNar', {
          type: 'dropdown',
          name: 'wNar',
          options: [],
          widthHint: 'established-narrow',
        }),
      ).not.toThrow();
      expect(() =>
        reg.setKey('wPx', { type: 'dropdown', name: 'wPx', options: [], widthHint: 64 }),
      ).not.toThrow();
      expect(() =>
        reg.setKey('wBad', {
          type: 'dropdown',
          name: 'wBad',
          options: [],
          widthHint: 'established-huge',
        }),
      ).toThrow(/widthHint/);
    });
  });
});
