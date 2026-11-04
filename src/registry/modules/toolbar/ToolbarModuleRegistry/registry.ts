import { ModuleRegistry } from '../../../ModuleRegistry';
import type { ValidationResult } from '../../../types';
import type { ToolbarGroup, ToolbarConfig, ToolbarConfigInput } from '../types';
import { BUTTON_KEYS, DROPDOWN_KEYS, COLOR_KEYS, GROUP_KEYS } from '../toolbarKeys';
import {
  RESERVED_ROOT_KEYS,
  ALLOWED_GROUP_FIELDS,
  ALLOWED_ITEM_FIELDS,
  DROPDOWN_BEHAVIOR_VALUES,
  DROPDOWN_LAYOUT_VALUES,
  DROPDOWN_DROPTYPE_VALUES,
} from './schema';
import {
  createItemResolver,
  resolveGroupKey,
  resolveItemKey,
  type GlobalResolve,
  type ResolveGroupFn,
} from './resolve';
import { validateDropdownWidthHint, validateUnknownFields } from './validate';
import { sortGroupsByOrder } from './sort';
import {
  parseCustomBlocks,
  parseGroupsArray,
  sublimateGroupArray,
  validateNameUniqueness,
} from './parse';
import { processGroupsExtends, validateExtendsValue } from './extends';

// ---------------------------------------------------------------------------
// ToolbarModuleRegistry
// ---------------------------------------------------------------------------

export class ToolbarModuleRegistry extends ModuleRegistry {
  private static readonly NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  private static readonly TYPE_PREFIXES = new Set([
    'group',
    'button',
    'dropdown',
    'color',
    'separator',
    'custom',
  ]);

  constructor() {
    super('toolbar');
    this.registerBuiltInKeys();
  }

  /**
   * Validated setKey: duck-typing + whitelist field check.
   *
   * Key format:
   *   - "group:name"  → value validated as ToolbarGroup
   *   - "name"        → value validated as ToolbarItem (must have `type`)
   *   - "prefix:name" → prefix must be a known type, otherwise rejected
   *
   * Name must match /^[a-zA-Z][a-zA-Z0-9_-]*$/
   */
  override setKey(key: string, value: unknown): void {
    const colonIdx = key.indexOf(':');
    if (colonIdx > 0) {
      const prefix = key.slice(0, colonIdx);
      const name = key.slice(colonIdx + 1);
      if (!ToolbarModuleRegistry.TYPE_PREFIXES.has(prefix)) {
        throw new Error(
          `Invalid key "${key}": unknown prefix "${prefix}:". ` +
            `Allowed: ${[...ToolbarModuleRegistry.TYPE_PREFIXES].join(', ')}`,
        );
      }
      ToolbarModuleRegistry.assertValidName(name, key);
      if (prefix === 'group') {
        ToolbarModuleRegistry.assertGroupShape(name, value);
      } else {
        ToolbarModuleRegistry.assertItemShape(key, value, prefix);
      }
    } else {
      ToolbarModuleRegistry.assertValidName(key, key);
      ToolbarModuleRegistry.assertItemShape(key, value);
    }
    super.setKey(key, value);
  }

  private static assertValidName(name: string, context: string): void {
    if (!ToolbarModuleRegistry.NAME_RE.test(name)) {
      throw new Error(
        `Invalid name "${name}" in "${context}": ` +
          `must start with a letter and contain only [a-zA-Z0-9_-]`,
      );
    }
  }

  private static assertGroupShape(name: string, value: unknown): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`group:${name} — value must be a plain object`);
    }
    const obj = value as Record<string, unknown>;
    if (obj.type !== undefined && obj.type !== 'group') {
      throw new Error(
        `group:${name} — type must be "group" when specified, got "${obj.type as string}"`,
      );
    }
    if (typeof obj.name !== 'string') {
      throw new Error(`group:${name} — must have a string "name" field`);
    }
    if (obj.name !== name) {
      throw new Error(`group:${name} — name "${obj.name}" doesn't match key suffix "${name}"`);
    }
    if (obj.items !== undefined && !Array.isArray(obj.items)) {
      throw new Error(`group:${name} — "items" must be an array`);
    }
    if (obj.type !== 'group' && obj.items === undefined) {
      throw new Error(
        `group:${name} — must have either type: "group" or an "items" array (or both)`,
      );
    }
    validateUnknownFields(obj, ALLOWED_GROUP_FIELDS, `group:${name}`);
  }

  private static assertItemShape(key: string, value: unknown, expectedType?: string): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`"${key}" — value must be a plain object`);
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.type !== 'string') {
      throw new Error(`"${key}" — must have a string "type" field`);
    }
    if (expectedType && obj.type !== expectedType) {
      throw new Error(`"${key}" — expected type "${expectedType}", got "${obj.type}"`);
    }
    const allowed = ALLOWED_ITEM_FIELDS[obj.type];
    if (!allowed) {
      throw new Error(`"${key}" — unknown item type "${obj.type}"`);
    }
    if ('name' in obj && typeof obj.name === 'string') {
      const expectedName = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      if (obj.name !== expectedName) {
        throw new Error(`"${key}" — name "${obj.name}" doesn't match key "${expectedName}"`);
      }
    }
    validateUnknownFields(obj, allowed, key);
    if ((obj.type === 'dropdown' || obj.type === 'color') && obj.behavior !== undefined) {
      if (typeof obj.behavior !== 'string') {
        throw new Error(`"${key}" — ${obj.type} behavior must be a string`);
      }
      if (!DROPDOWN_BEHAVIOR_VALUES.has(obj.behavior)) {
        throw new Error(
          `"${key}" — invalid ${obj.type} behavior "${obj.behavior}"; expected "established", "recognized", or "recognized-toggle"`,
        );
      }
    }
    if ((obj.type === 'dropdown' || obj.type === 'color') && obj.layout !== undefined) {
      if (typeof obj.layout !== 'string') {
        throw new Error(`"${key}" — ${obj.type} layout must be a string`);
      }
      if (!DROPDOWN_LAYOUT_VALUES.has(obj.layout)) {
        throw new Error(
          `"${key}" — invalid ${obj.type} layout "${obj.layout}"; expected "single" or "split"`,
        );
      }
    }
    if (obj.type === 'dropdown' && obj.widthHint !== undefined) {
      validateDropdownWidthHint(obj.widthHint, `"${key}"`);
    }
    if (obj.type === 'dropdown' && obj.droptype !== undefined) {
      if (typeof obj.droptype !== 'string') {
        throw new Error(`"${key}" — dropdown droptype must be a string`);
      }
      if (!DROPDOWN_DROPTYPE_VALUES.has(obj.droptype)) {
        throw new Error(
          `"${key}" — invalid dropdown droptype "${obj.droptype}"; expected "list", "sections", or "accordions"`,
        );
      }
    }
  }

  private registerBuiltInKeys(): void {
    for (const [key, value] of Object.entries(BUTTON_KEYS)) {
      this.setKey(key, value);
    }
    for (const [key, value] of Object.entries(DROPDOWN_KEYS)) {
      this.setKey(key, value);
    }
    for (const [key, value] of Object.entries(COLOR_KEYS)) {
      this.setKey(key, value);
    }
    for (const [key, value] of Object.entries(GROUP_KEYS)) {
      this.setKey(`group:${key}`, value);
    }
  }

  /**
   * Sublimate short config: string item keys → full ToolbarItem objects,
   * string group keys → full ToolbarGroup objects.
   */
  override sublimate(shortConfig: unknown): unknown {
    if (typeof shortConfig === 'string') {
      return resolveItemKey(shortConfig) ?? resolveGroupKey(shortConfig) ?? shortConfig;
    }
    if (Array.isArray(shortConfig)) {
      return shortConfig.map((item) => this.sublimate(item));
    }
    return shortConfig;
  }

  /**
   * Resolve raw JSON toolbar config to fully normalized ToolbarConfig.
   * Supports `extends: "base"` / `configuration: "base"` mode (merge with
   * defaults) and raw mode. Resolves extends at group and item levels,
   * validates name uniqueness.
   *
   * @param globalResolve - optional callback for cross-module key resolution.
   *   When an item key is not found in toolbar's own registry, this function
   *   is called to discover keys from other registered modules.
   */
  resolveConfig(
    input: ToolbarConfigInput,
    defaultConfig: ToolbarConfig,
    globalResolve?: GlobalResolve,
  ): ToolbarConfig {
    const extendsValue = input.extends as string | undefined;
    const configurationValue = input.configuration as string | undefined;

    if (extendsValue !== undefined) {
      validateExtendsValue(extendsValue, 'root');
    }

    const isBase = (extendsValue ?? configurationValue) === 'base';

    const resolveGroup: ResolveGroupFn = (key: string) =>
      resolveGroupKey(key) ?? (this.resolveKey(`group:${key}`) as ToolbarGroup | undefined);

    let groups: ToolbarGroup[];
    let overflow: ToolbarGroup[] | undefined;
    let settings: ToolbarGroup[] | undefined;
    let customBlocks: Record<string, ToolbarGroup[]>;

    if (isBase) {
      groups = defaultConfig.groups.slice();
      overflow = defaultConfig.overflow?.slice();
      settings = defaultConfig.settings?.slice();

      if (Array.isArray(input.groups) && input.groups.length > 0) {
        const parsed = parseGroupsArray(input.groups, 'groups', resolveGroup);
        const byName = new Map(parsed.map((g) => [g.name, g]));
        groups = groups.map((g) => byName.get(g.name) ?? g);
        for (const g of parsed) {
          if (!groups.some((x) => x.name === g.name)) groups.push(g);
        }
        groups = sortGroupsByOrder(groups);
      }
      if (input.overflow != null) {
        if (!Array.isArray(input.overflow)) throw new Error('overflow must be an array of groups');
        overflow = parseGroupsArray(input.overflow, 'overflow', resolveGroup);
      }
      if (input.settings != null) {
        if (!Array.isArray(input.settings)) throw new Error('settings must be an array of groups');
        settings = parseGroupsArray(input.settings, 'settings', resolveGroup);
      }
      customBlocks = parseCustomBlocks(input, RESERVED_ROOT_KEYS, resolveGroup);
    } else {
      groups = parseGroupsArray(input.groups, 'groups', resolveGroup);
      overflow =
        input.overflow != null
          ? parseGroupsArray(input.overflow, 'overflow', resolveGroup)
          : undefined;
      settings =
        input.settings != null
          ? parseGroupsArray(input.settings, 'settings', resolveGroup)
          : undefined;
      customBlocks = parseCustomBlocks(input, RESERVED_ROOT_KEYS, resolveGroup);
    }

    const resolveItem = createItemResolver(globalResolve);
    const resolve = (gs: ToolbarGroup[]): ToolbarGroup[] =>
      sublimateGroupArray(processGroupsExtends(gs, resolveItem, resolveGroup), resolveItem);

    const result: ToolbarConfig = { groups: resolve(groups) };
    if (overflow !== undefined && overflow.length > 0) {
      result.overflow = resolve(overflow);
    }
    if (settings !== undefined && settings.length > 0) {
      result.settings = resolve(settings);
    }
    if (Object.keys(customBlocks).length > 0) {
      const cb: Record<string, ToolbarGroup[]> = {};
      for (const [k, v] of Object.entries(customBlocks)) {
        cb[k] = resolve(v);
      }
      result.customBlocks = cb;
    }

    validateNameUniqueness(result.groups, 'groups');
    if (result.overflow) validateNameUniqueness(result.overflow, 'overflow');
    if (result.settings) validateNameUniqueness(result.settings, 'settings');
    if (result.customBlocks) {
      for (const [k, v] of Object.entries(result.customBlocks)) {
        validateNameUniqueness(v, k);
      }
    }

    return result;
  }

  override validate(
    availableTypes: ReadonlySet<string>,
    registeredKeys: ReadonlySet<string>,
  ): ValidationResult {
    return super.validate(availableTypes, registeredKeys);
  }
}
