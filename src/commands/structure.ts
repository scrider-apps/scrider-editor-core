/**
 * Structure commands (split / exit / delete / insert / selectAll).
 *
 * Implementation moved to `./structure/` — this file is a compatibility
 * re-export shim so existing `from './structure'` / `commands/structure`
 * imports keep working unchanged.
 */
export * from './structure/index';
