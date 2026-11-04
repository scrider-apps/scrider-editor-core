import type { ToolbarGroup } from '../types';

/**
 * Sort groups by (order ?? Infinity, arrayIndex).
 */
export function sortGroupsByOrder(groups: ToolbarGroup[]): ToolbarGroup[] {
  return [...groups]
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const orderA = a.g.order ?? Infinity;
      const orderB = b.g.order ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;
      return a.i - b.i;
    })
    .map(({ g }) => g);
}
