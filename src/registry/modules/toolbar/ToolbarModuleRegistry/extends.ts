import type { ToolbarItem, ToolbarGroup } from '../types';
import { ALLOWED_ITEM_FIELDS } from './schema';
import { resolveGroupKey, type ResolveGroupFn, type ResolveItemFn } from './resolve';
import { validateItemFields } from './validate';

// ---------------------------------------------------------------------------
// extends resolution — declarative merge at group and item levels
// ---------------------------------------------------------------------------

export function validateExtendsValue(value: string, context: string): void {
  if (value !== 'base') {
    throw new Error(`Invalid extends value "${value}" in ${context} — only "base" is supported`);
  }
}

export function resolveItemExtends(
  raw: Record<string, unknown>,
  resolveItem: ResolveItemFn,
): ToolbarItem {
  const ext = raw.extends as string;
  const name = raw.name as string;
  if (!name) throw new Error('Item with extends must have a name');
  validateExtendsValue(ext, `item "${name}"`);

  const baseItem = resolveItem(name);
  if (!baseItem) throw new Error(`Cannot extend: unknown item "${name}"`);

  if (raw.type !== undefined && raw.type !== baseItem.type) {
    throw new Error(
      `Type mismatch for "${name}": registered as "${baseItem.type}", ` +
        `got "${raw.type as string}". Types are immutable with extends`,
    );
  }

  const allowedType = (raw.type as string | undefined) ?? baseItem.type;
  const allowed = ALLOWED_ITEM_FIELDS[allowedType];
  if (allowed) {
    for (const key of Object.keys(raw)) {
      if (key === 'extends') continue;
      if (!allowed.has(key)) {
        throw new Error(`Unknown field "${key}" in item "${name}"`);
      }
    }
  }

  const merged = { ...baseItem } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'extends') continue;
    merged[k] = v;
  }
  return merged as unknown as ToolbarItem;
}

export function resolveItemsCRUD(
  baseItems: ToolbarItem[],
  userItemsRaw: unknown[],
  resolveItem: ResolveItemFn,
): ToolbarItem[] {
  const userItems: ToolbarItem[] = userItemsRaw.map((raw) => {
    if (typeof raw === 'string') {
      const resolved = resolveItem(raw);
      if (!resolved) throw new Error(`Unknown item key "${raw}"`);
      return resolved;
    }
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (obj.extends !== undefined) return resolveItemExtends(obj, resolveItem);
      validateItemFields(obj, `item "${(obj.name as string) ?? '?'}"`);
      return raw as ToolbarItem;
    }
    throw new Error(`Invalid item: ${String(raw)}`);
  });

  const userByName = new Map<string, ToolbarItem>();
  for (const item of userItems) {
    if ('name' in item) userByName.set(item.name, item);
  }

  const result: ToolbarItem[] = [];
  const processedNames = new Set<string>();

  for (const baseItem of baseItems) {
    const name = 'name' in baseItem ? baseItem.name : undefined;
    if (name && userByName.has(name)) {
      result.push(userByName.get(name)!);
      processedNames.add(name);
    }
  }

  for (const item of userItems) {
    const name = 'name' in item ? item.name : undefined;
    if (!name || !processedNames.has(name)) {
      result.push(item);
    }
  }

  return result;
}

export function resolveGroupExtends(
  raw: Record<string, unknown>,
  resolveItem: ResolveItemFn,
  resolveGroup: ResolveGroupFn = resolveGroupKey,
): ToolbarGroup {
  const ext = raw.extends as string;
  const name = raw.name as string;
  if (!name) throw new Error('Group with extends must have a name');
  validateExtendsValue(ext, `group "${name}"`);

  const baseGroup = resolveGroup(name);
  if (!baseGroup) throw new Error(`Cannot extend: unknown group "${name}"`);

  const merged = { ...baseGroup } as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'extends' || k === 'items') continue;
    merged[k] = v;
  }

  if (raw.items !== undefined) {
    if (!Array.isArray(raw.items)) throw new Error(`items must be an array in group "${name}"`);
    merged.items = resolveItemsCRUD(baseGroup.items ?? [], raw.items as unknown[], resolveItem);
  }

  return merged as unknown as ToolbarGroup;
}

export function processGroupExtends(
  group: ToolbarGroup,
  resolveItem: ResolveItemFn,
  resolveGroup: ResolveGroupFn = resolveGroupKey,
): ToolbarGroup {
  const raw = group as unknown as Record<string, unknown>;
  if (raw.extends !== undefined) return resolveGroupExtends(raw, resolveItem, resolveGroup);
  if (!group.items) return group;
  let changed = false;
  const items = (group.items as unknown[]).map((item) => {
    if (typeof item === 'string') {
      changed = true;
      return resolveItem(item) ?? item;
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      if ('extends' in obj) {
        changed = true;
        return resolveItemExtends(obj, resolveItem);
      }
      validateItemFields(obj, `item "${(obj.name as string) ?? '?'}"`);
      return item;
    }
    return item;
  }) as ToolbarItem[];
  return changed ? { ...group, items } : group;
}

export function processGroupsExtends(
  groups: ToolbarGroup[],
  resolveItem: ResolveItemFn,
  resolveGroup: ResolveGroupFn = resolveGroupKey,
): ToolbarGroup[] {
  return groups.map((g) => processGroupExtends(g, resolveItem, resolveGroup));
}
