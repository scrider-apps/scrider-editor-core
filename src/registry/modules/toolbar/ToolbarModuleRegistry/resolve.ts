import type { ToolbarItem, ToolbarGroup } from '../types';
import { BUTTON_KEYS, DROPDOWN_KEYS, COLOR_KEYS, GROUP_KEYS } from '../toolbarKeys';

/**
 * Callback for cross-module key resolution.
 * Provided by GlobalRegistry to allow modules to discover keys
 * registered by other modules without direct dependencies.
 */
export type GlobalResolve = (key: string | object) => unknown;

/** Internal type for item resolution: local keys + optional global fallback. */
export type ResolveItemFn = (key: string) => ToolbarItem | undefined;

/** Internal type for group resolution: static keys + dynamic registry keys. */
export type ResolveGroupFn = (key: string) => ToolbarGroup | undefined;

/**
 * Resolve a single item short key (string) to a full ToolbarItem.
 * Looks up BUTTON_KEYS, then DROPDOWN_KEYS, then COLOR_KEYS.
 */
export function resolveItemKey(key: string): ToolbarItem | undefined {
  return BUTTON_KEYS[key] ?? DROPDOWN_KEYS[key] ?? COLOR_KEYS[key];
}

export function createItemResolver(globalResolve?: GlobalResolve): ResolveItemFn {
  if (!globalResolve) return resolveItemKey;
  return (key: string) => resolveItemKey(key) ?? (globalResolve(key) as ToolbarItem | undefined);
}

/**
 * Resolve a group short key (string) to a full ToolbarGroup.
 * Static GROUP_KEYS only — used as default when no registry instance available.
 */
export function resolveGroupKey(key: string): ToolbarGroup | undefined {
  return GROUP_KEYS[key];
}
