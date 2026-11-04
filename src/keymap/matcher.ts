import type { KeyBinding, KeyEvent } from './types';

/**
 * Find the first `KeyBinding` that matches the given `KeyEvent`.
 *
 * Matching rules:
 * - `key` is compared case-insensitively.
 * - Modifier flags (`ctrl`, `shift`, `alt`, `meta`) must match exactly.
 *   A binding with `ctrl: true` requires `ctrlKey === true`.
 *   A binding without `ctrl` (or `ctrl: false/undefined`) requires `ctrlKey === false`.
 *
 * Returns `null` if no binding matches.
 */
export function matchKeyBinding(event: KeyEvent, keymap: readonly KeyBinding[]): KeyBinding | null {
  for (const binding of keymap) {
    if (binding.key.toLowerCase() !== event.key.toLowerCase()) continue;

    if (Boolean(binding.ctrl) !== event.ctrlKey) continue;
    if (Boolean(binding.shift) !== event.shiftKey) continue;
    if (Boolean(binding.alt) !== event.altKey) continue;
    if (Boolean(binding.meta) !== event.metaKey) continue;

    return binding;
  }

  return null;
}
