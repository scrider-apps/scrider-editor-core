import type { ToolbarConfig, ToolbarGroup, ToolbarItem } from './types';
import { BUTTON_KEYS, DROPDOWN_KEYS, COLOR_KEYS, GROUP_KEYS } from './toolbarKeys';

export type CompactLevel = 'full' | 'button' | 'group';

function itemMatchesKey(item: ToolbarItem, keys: Record<string, ToolbarItem>): string | null {
  if (!('name' in item) || typeof item.name !== 'string') return null;
  const registered = keys[item.name];
  if (!registered) return null;
  if (JSON.stringify(item) === JSON.stringify(registered)) return item.name;
  return null;
}

function compactItem(item: ToolbarItem): string | ToolbarItem {
  const key =
    itemMatchesKey(item, BUTTON_KEYS) ??
    itemMatchesKey(item, DROPDOWN_KEYS) ??
    itemMatchesKey(item, COLOR_KEYS);
  if (key) return key;
  // External module items (e.g. inline-ext): have type+name but not in built-in keys.
  // Compact to name so resolveConfig can expand via globalResolve.
  if (
    typeof item === 'object' &&
    item !== null &&
    'name' in item &&
    typeof (item as { name: unknown }).name === 'string'
  ) {
    return (item as { name: string }).name;
  }
  return item;
}

function compactGroupItems(group: ToolbarGroup): ToolbarGroup {
  if (!group.items) return group;
  return { ...group, items: group.items.map(compactItem) as ToolbarItem[] };
}

function groupMatchesKey(group: ToolbarGroup): string | null {
  const registered = GROUP_KEYS[group.name];
  if (!registered) return null;
  if (JSON.stringify(group) === JSON.stringify(registered)) return group.name;
  return null;
}

/**
 * At group level: if group has name and all items are string keys (already compacted),
 * treat as a known group and compact to group name (e.g. inline-ext from toolbarRegistry.setKey).
 */
function groupCompactibleToName(group: ToolbarGroup): boolean {
  if (!group.name || !Array.isArray(group.items)) return false;
  return group.items.every((it) => typeof it === 'string');
}

function compactGroupArray(groups: ToolbarGroup[], level: CompactLevel): (string | ToolbarGroup)[] {
  if (level === 'group') {
    return groups.map((g) => {
      const withCompactItems = compactGroupItems(g);
      if (groupMatchesKey(withCompactItems)) return withCompactItems.name;
      if (groupCompactibleToName(withCompactItems)) return withCompactItems.name;
      return withCompactItems;
    });
  }
  if (level === 'button') {
    return groups.map(compactGroupItems);
  }
  return groups;
}

/**
 * Compact a ToolbarConfig to a shorter representation by replacing
 * known items/groups with their string keys.
 *
 * - `'full'`   — no changes, returns as-is
 * - `'button'` — items matching registered keys become strings
 * - `'group'`  — groups matching registered keys also become strings
 *
 * The result is JSON-serializable and can be fed back to resolveConfig
 * (sublimation will expand strings back to full objects).
 */
export function compactToolbarConfig(
  config: ToolbarConfig,
  level: CompactLevel,
): Record<string, unknown> {
  if (level === 'full') return config as unknown as Record<string, unknown>;

  const result: Record<string, unknown> = {
    groups: compactGroupArray(config.groups, level),
  };

  if (config.overflow && config.overflow.length > 0) {
    result.overflow = compactGroupArray(config.overflow, level);
  }
  if (config.settings && config.settings.length > 0) {
    result.settings = compactGroupArray(config.settings, level);
  }
  if (config.customBlocks) {
    const cb: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config.customBlocks)) {
      cb[k] = compactGroupArray(v, level);
    }
    result.customBlocks = cb;
  }
  return result;
}
