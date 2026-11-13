import type { ToolbarConfig, ToolbarGroup, ToolbarItem } from './types';
import { BUTTON_KEYS, DROPDOWN_KEYS, COLOR_KEYS, GROUP_KEYS } from './toolbarKeys';

export type CompactLevel = 'full' | 'button' | 'group';

/**
 * Resolves a toolbar input the way the editor does, e.g.
 * `(input) => toolbarRegistry.resolveConfig(input, baseToolbar, globalResolve)`.
 */
export type CompactResolve = (input: Record<string, unknown>) => ToolbarConfig;

export interface CompactToolbarOptions {
  /**
   * With it an item or a group becomes its name only when the name resolves back
   * to the same object; a group is checked in its row. Without it only built-in
   * groups compact to their names, and items compact by name alone.
   */
  resolve?: CompactResolve;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function itemMatchesKey(item: ToolbarItem, keys: Record<string, ToolbarItem>): string | null {
  if (!('name' in item) || typeof item.name !== 'string') return null;
  const registered = keys[item.name];
  if (!registered) return null;
  if (JSON.stringify(item) === JSON.stringify(registered)) return item.name;
  return null;
}

function itemKey(item: ToolbarItem): string | null {
  const key =
    itemMatchesKey(item, BUTTON_KEYS) ??
    itemMatchesKey(item, DROPDOWN_KEYS) ??
    itemMatchesKey(item, COLOR_KEYS);
  if (key) return key;
  // External module items (e.g. inline-ext): have type+name but not in built-in keys.
  // Compact to name so resolveConfig can expand via globalResolve.
  if ('name' in item && typeof (item as { name: unknown }).name === 'string') {
    return (item as { name: string }).name;
  }
  return null;
}

function resolveGroups(groups: unknown[], resolve: CompactResolve): ToolbarGroup[] | null {
  try {
    return resolve({ groups }).groups;
  } catch {
    return null;
  }
}

function compactItem(
  group: ToolbarGroup,
  item: ToolbarItem | string,
  resolve?: CompactResolve,
): ToolbarItem | string {
  if (typeof item === 'string') return item;
  const key = itemKey(item);
  if (!key) return item;
  if (!resolve) return key;
  const back = resolveGroups([{ ...group, items: [key] }], resolve);
  return same(back?.[0]?.items?.[0], item) ? key : item;
}

function compactGroupItems(group: ToolbarGroup, resolve?: CompactResolve): ToolbarGroup {
  if (!group.items) return group;
  const items = group.items.map((item) => compactItem(group, item, resolve));
  return { ...group, items: items as ToolbarItem[] };
}

/** Without `resolve` a group compacts to its name when it equals the built-in group key. */
function builtInGroupKey(group: ToolbarGroup): string | null {
  if (!group.name) return null;
  const registered = GROUP_KEYS[group.name];
  if (!registered) return null;
  return same(compactGroupItems(group), compactGroupItems(registered)) ? group.name : null;
}

/**
 * A group becomes its name only when the whole row still resolves to the same
 * groups. The resolver may tune a group by its neighbours (priority in a full
 * row), so the name is checked in place, not alone.
 */
function compactGroupsInRow(
  groups: ToolbarGroup[],
  resolve: CompactResolve,
): (string | ToolbarGroup)[] {
  const row: (string | ToolbarGroup)[] = groups.map((g) => compactGroupItems(g, resolve));
  const target = resolveGroups(row, resolve);
  if (!target) return row;
  groups.forEach((group, i) => {
    if (!group.name) return;
    const candidate = row.slice();
    candidate[i] = group.name;
    if (same(resolveGroups(candidate, resolve), target)) row[i] = group.name;
  });
  return row;
}

function compactGroupArray(
  groups: ToolbarGroup[],
  level: CompactLevel,
  resolve?: CompactResolve,
): (string | ToolbarGroup)[] {
  if (level === 'group') {
    if (resolve) return compactGroupsInRow(groups, resolve);
    return groups.map((g) => builtInGroupKey(g) ?? compactGroupItems(g));
  }
  if (level === 'button') {
    return groups.map((g) => compactGroupItems(g, resolve));
  }
  return groups;
}

/**
 * Compact a ToolbarConfig to a shorter representation by replacing
 * known items/groups with their string keys.
 *
 * - `'full'`   — no changes, returns as-is
 * - `'button'` — items matching registered keys become strings
 * - `'group'`  — groups whose name resolves back to the same group also become strings
 *
 * The result is JSON-serializable and can be fed back to resolveConfig
 * (sublimation will expand strings back to full objects). Pass `resolve`
 * to guarantee that round trip for groups and items from extensions.
 */
export function compactToolbarConfig(
  config: ToolbarConfig,
  level: CompactLevel,
  options: CompactToolbarOptions = {},
): Record<string, unknown> {
  if (level === 'full') return config as unknown as Record<string, unknown>;
  const { resolve } = options;

  const result: Record<string, unknown> = {
    groups: compactGroupArray(config.groups, level, resolve),
  };

  if (config.overflow && config.overflow.length > 0) {
    result.overflow = compactGroupArray(config.overflow, level, resolve);
  }
  if (config.settings && config.settings.length > 0) {
    result.settings = compactGroupArray(config.settings, level, resolve);
  }
  if (config.customBlocks) {
    const cb: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config.customBlocks)) {
      cb[k] = compactGroupArray(v, level, resolve);
    }
    result.customBlocks = cb;
  }
  return result;
}
