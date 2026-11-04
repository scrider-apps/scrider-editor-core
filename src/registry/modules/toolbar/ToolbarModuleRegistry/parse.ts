import type { ToolbarItem, ToolbarGroup } from '../types';
import { resolveGroupKey, type ResolveGroupFn, type ResolveItemFn } from './resolve';
import { validateGroup } from './validate';
import { sortGroupsByOrder } from './sort';

export function parseGroupsArray(
  input: unknown,
  context: string,
  resolveGroup: ResolveGroupFn = resolveGroupKey,
): ToolbarGroup[] {
  if (!Array.isArray(input)) return [];
  const result: ToolbarGroup[] = [];
  for (let i = 0; i < input.length; i++) {
    const raw: unknown = input[i];
    if (typeof raw === 'string') {
      const resolved = resolveGroup(raw);
      if (!resolved) throw new Error(`Unknown group key "${raw}" in ${context}[${i}]`);
      result.push(resolved);
    } else {
      validateGroup(raw, `${context}[${i}]`);
      result.push(raw);
    }
  }
  return sortGroupsByOrder(result);
}

/**
 * Sublimate string item keys inside a group's items array.
 */
export function sublimateGroupItems(group: ToolbarGroup, resolveItem: ResolveItemFn): ToolbarGroup {
  if (!group.items) return group;
  const hasStrings = group.items.some((item) => typeof item === 'string');
  if (!hasStrings) return group;
  const resolved = (group.items as unknown[]).map((item) => {
    if (typeof item === 'string') {
      const full = resolveItem(item);
      if (full) return full;
    }
    return item;
  }) as ToolbarItem[];
  return { ...group, items: resolved };
}

export function sublimateGroupArray(
  groups: ToolbarGroup[],
  resolveItem: ResolveItemFn,
): ToolbarGroup[] {
  return groups.map((g) => sublimateGroupItems(g, resolveItem));
}

export function validateNameUniqueness(groups: ToolbarGroup[], context: string): void {
  const seenNames = new Set<string>();
  for (const group of groups) {
    if (seenNames.has(group.name)) {
      throw new Error(`Duplicate group name "${group.name}" in ${context}`);
    }
    seenNames.add(group.name);
    if (group.items) {
      const seenItemNames = new Set<string>();
      for (const item of group.items) {
        if (typeof item !== 'object' || item === null || !('name' in item)) continue;
        const itemName = (item as { name: string }).name;
        if (seenItemNames.has(itemName)) {
          throw new Error(`Duplicate item name "${itemName}" in group "${group.name}"`);
        }
        seenItemNames.add(itemName);
      }
    }
  }
}

export function parseCustomBlocks(
  input: Record<string, unknown>,
  skipKeys: Set<string>,
  resolveGroup: ResolveGroupFn = resolveGroupKey,
): Record<string, ToolbarGroup[]> {
  const customBlocks: Record<string, ToolbarGroup[]> = {};
  for (const key of Object.keys(input)) {
    if (skipKeys.has(key)) continue;
    const val = input[key];
    if (!Array.isArray(val)) continue;
    customBlocks[key] = parseGroupsArray(val, key, resolveGroup);
  }
  if (
    input.customBlocks != null &&
    typeof input.customBlocks === 'object' &&
    !Array.isArray(input.customBlocks)
  ) {
    const raw = input.customBlocks as Record<string, unknown>;
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (Array.isArray(v)) {
        customBlocks[k] = parseGroupsArray(v, `customBlocks.${k}`, resolveGroup);
      }
    }
  }
  return customBlocks;
}
