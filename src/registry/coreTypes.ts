import type { CoreTypeDef } from './types';

/**
 * Bootstrap core types — immutable, available from ScriderRegistry.init().
 * Module and plugin registries reference these types; the global registry
 * validates that every referenced type exists in this set.
 */
export const CORE_TYPES: readonly CoreTypeDef[] = Object.freeze([
  Object.freeze({ name: 'button', requiredFields: Object.freeze(['name', 'command']) }),
  Object.freeze({ name: 'dropdown', requiredFields: Object.freeze(['name', 'options']) }),
  Object.freeze({
    name: 'dropdown-option',
    requiredFields: Object.freeze(['label', 'command']),
  }),
  Object.freeze({ name: 'separator', requiredFields: Object.freeze([]) }),
  Object.freeze({ name: 'group', requiredFields: Object.freeze(['name', 'items']) }),
  Object.freeze({ name: 'color', requiredFields: Object.freeze(['name', 'command', 'colors']) }),
  Object.freeze({ name: 'custom', requiredFields: Object.freeze(['name']) }),
]);

const coreTypeMap = new Map<string, CoreTypeDef>(CORE_TYPES.map((t) => [t.name, t]));

/**
 * Check whether a type name is a known core type.
 */
export function isCoreType(name: string): boolean {
  return coreTypeMap.has(name);
}

/**
 * Get a core type definition by name, or `undefined` if not found.
 */
export function getCoreType(name: string): CoreTypeDef | undefined {
  return coreTypeMap.get(name);
}

/**
 * Get all core type names.
 */
export function getCoreTypeNames(): readonly string[] {
  return CORE_TYPES.map((t) => t.name);
}
