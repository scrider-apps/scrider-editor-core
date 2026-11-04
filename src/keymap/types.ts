/**
 * A keyboard shortcut binding that maps a key combination to a command name.
 */
export interface KeyBinding {
  /** The key value (e.g. 'b', 'z', 'Enter', 'Backspace', 'Tab'). */
  readonly key: string;
  /** Ctrl / Cmd required. */
  readonly ctrl?: boolean;
  /** Shift required. */
  readonly shift?: boolean;
  /** Alt required. */
  readonly alt?: boolean;
  /** Meta (Windows / Cmd) required. */
  readonly meta?: boolean;
  /** Command name to execute (must exist in the command registry). */
  readonly command: string;
  /** Optional extra arguments passed to the command. */
  readonly args?: readonly unknown[];
}

/**
 * A platform-agnostic abstraction of a keyboard event.
 * No DOM dependency — just the relevant fields.
 */
export interface KeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}
