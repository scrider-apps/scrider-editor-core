import type { ToolbarGroup } from '../types';
import {
  ALLOWED_GROUP_FIELDS,
  ALLOWED_ITEM_FIELDS,
  DROPDOWN_BEHAVIOR_VALUES,
  DROPDOWN_LAYOUT_VALUES,
  DROPDOWN_DROPTYPE_VALUES,
  DROPDOWN_WIDTH_HINT_PRESETS,
} from './schema';
import { resolveItemKey } from './resolve';

export function validateDropdownWidthHint(value: unknown, context: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Dropdown widthHint must be a non-negative finite number in ${context}`);
    }
    return;
  }
  if (typeof value === 'string') {
    if (!DROPDOWN_WIDTH_HINT_PRESETS.has(value)) {
      throw new Error(
        `Invalid dropdown widthHint "${value}" in ${context}; expected a px number, "established-wide", or "established-narrow"`,
      );
    }
    return;
  }
  throw new Error(
    `Dropdown widthHint must be a number or preset string in ${context}; expected px, "established-wide", or "established-narrow"`,
  );
}

export function validateUnknownFields(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  context: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key) && typeof obj[key] !== 'function') {
      throw new Error(`Unknown field "${key}" in ${context}`);
    }
  }
}

export function validateItemFields(obj: Record<string, unknown>, context: string): void {
  let type = obj.type as string | undefined;
  if (!type) {
    if (obj.extends !== undefined) return;
    const name = obj.name as string | undefined;
    if (name) {
      const base = resolveItemKey(name);
      if (base) type = base.type;
    }
    if (!type) return;
  }
  const allowed = ALLOWED_ITEM_FIELDS[type];
  if (!allowed) return;
  validateUnknownFields(obj, allowed, context);

  if ((type === 'dropdown' || type === 'color') && obj.behavior !== undefined) {
    if (typeof obj.behavior !== 'string') {
      throw new Error(`${type} behavior must be a string in ${context}`);
    }
    if (!DROPDOWN_BEHAVIOR_VALUES.has(obj.behavior)) {
      throw new Error(
        `Invalid ${type} behavior "${obj.behavior}" in ${context}; expected "established", "recognized", or "recognized-toggle"`,
      );
    }
  }
  if ((type === 'dropdown' || type === 'color') && obj.layout !== undefined) {
    if (typeof obj.layout !== 'string') {
      throw new Error(`${type} layout must be a string in ${context}`);
    }
    if (!DROPDOWN_LAYOUT_VALUES.has(obj.layout)) {
      throw new Error(
        `Invalid ${type} layout "${obj.layout}" in ${context}; expected "single" or "split"`,
      );
    }
  }
  if (type === 'dropdown' && obj.widthHint !== undefined) {
    validateDropdownWidthHint(obj.widthHint, context);
  }
  if (type === 'dropdown' && obj.droptype !== undefined) {
    if (typeof obj.droptype !== 'string') {
      throw new Error(`Dropdown droptype must be a string in ${context}`);
    }
    if (!DROPDOWN_DROPTYPE_VALUES.has(obj.droptype)) {
      throw new Error(
        `Invalid dropdown droptype "${obj.droptype}" in ${context}; expected "list", "sections", or "accordions"`,
      );
    }
  }
}

const INVALID_GROUP_MSG = 'Invalid group: object in groups array must have type "group"';

export function validateGroup(obj: unknown, context: string): asserts obj is ToolbarGroup {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`${INVALID_GROUP_MSG} (${context})`);
  }
  const g = obj as Record<string, unknown>;
  if (g.type !== undefined && g.type !== 'group') {
    throw new Error(INVALID_GROUP_MSG);
  }
  if (typeof g.name !== 'string') {
    throw new Error(`${INVALID_GROUP_MSG} (${context})`);
  }
  validateUnknownFields(g, ALLOWED_GROUP_FIELDS, `group "${g.name}"`);
  if (g.type === 'group') return;
  if (g.extends !== undefined) return;
  if (g.items === undefined || !Array.isArray(g.items)) {
    throw new Error(`${INVALID_GROUP_MSG} (${context})`);
  }
}
