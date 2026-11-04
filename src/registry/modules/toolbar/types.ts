// ---------------------------------------------------------------------------
// Toolbar config types — pure data, framework-agnostic, JSON-serializable.
// Framework layers (e.g. `@scrider/editor-react`) may extend these with
// runtime callbacks (isDisabled, render) after receiving resolvedConfig.
// ---------------------------------------------------------------------------

/**
 * Declarative rule for disabling a toolbar element.
 * Core defines the semantics; framework layer interprets at render time.
 */
export type DisabledWhenRule = 'cannotUndo' | 'cannotRedo' | 'noSelection';

// ---------------------------------------------------------------------------
// Toolbar items
// ---------------------------------------------------------------------------

export interface ToolbarButtonItem {
  type: 'button';
  name: string;
  command: string;
  args?: unknown[];
  icon?: string;
  iconSize?: number;
  label?: string;
  tooltip?: string;
  format?: string;
  formatValue?: unknown;
  promptMessage?: string;
  disabledWhen?: DisabledWhenRule;
  extends?: string;
}

export interface ToolbarDropdownOption {
  /** Language/value identifier (e.g. for Prism, markdown). Shown in list when displayLabel omitted. */
  label: string;
  /** Human-readable label in list and tooltip when this option is selected. */
  displayLabel?: string;
  /** Optional. Tooltip when this option is selected; defaults to displayLabel, then label. */
  tooltip?: string;
  icon?: string;
  /** Face/trigger icon size in px when this option is shown (default 18). */
  iconSize?: number;
  command: string;
  args?: unknown[];
  format?: string;
  /**
   * Value to match against `snapshot.formats[format]` for active highlighting.
   *
   * Special semantics for `null`:
   *   `formatValue: null` means "active when the format is **absent**"
   *   (i.e. `snapshot.formats[format]` is `null` or `undefined`).
   *   Use this for the "default / none" option of a dropdown so the
   *   trigger correctly shows e.g. "Paragraph" when no heading is set,
   *   "Left" when no align attribute, "System" when no font, etc.
   */
  formatValue?: unknown;
  /** Section key for grouping when droptype is 'sections' or 'accordions'. */
  section?: string;
  /**
   * Visibility gate.
   *
   * When `true`, the option is rendered only if `snapshot.extendedHeadings`
   * is also true. Used to keep advanced heading levels (H4-H6) out of the
   * dropdown for the vast majority of users who only ever need H1-H3,
   * while still allowing power users (and round-trip from external
   * markdown) to access them via a settings checkbox.
   */
  extendedOnly?: boolean;
  /**
   * Render a thin horizontal separator *after* this option in the dropdown
   * menu. Useful to visually split a primary cluster from extras
   * (e.g. `Paragraph / H1 / H2 / H3 ─── H4 / H5 / H6`).
   */
  dividerAfter?: boolean;
}

/**
 * Dropdown display mode:
 * - `'list'` (default) — flat list of options.
 * - `'sections'` — grouped by option.section with headers, all expanded.
 * - `'accordions'` — grouped by option.section, sections collapsible.
 */
export type DropdownType = 'list' | 'sections' | 'accordions';

/**
 * Dropdown / color face policy — **item-level** toolbar JSON field (`behavior`).
 * Reserved in schema: `DROPDOWN_BEHAVIOR_VALUES`.
 *
 * - `'recognized'` (default) — face tracks `snapshot.formats` at caret; no sticky
 *   pressed. Font Family / Font Size.
 * - `'recognized-toggle'` — caret detect + Bold-like pressed while a non-default
 *   option is active; clears on re-detect; face click toggles off → default
 *   (`formatValue: null`). Always split. Align (Font/Size may opt in via JSON).
 * - `'established'` — last manual pick; does not auto-switch on caret move.
 *   Heading / List / codeBlock / Color swatches. Always split.
 *
 * Future (not in schema yet): `'action'` — fire-and-forget, no face track / pressed.
 * Per-option behavior inside one dropdown — also future; no real case yet.
 */
export type DropdownBehavior = 'recognized' | 'recognized-toggle' | 'established';

/**
 * Dropdown chrome:
 * - `'single'` (default) — one trigger opens the list.
 * - `'split'` — `[apply | chevron]`; action applies the current face value without
 *   opening; chevron opens the list. Font/Size use `layout: 'split'` + recognized.
 *   `behavior: 'established' | 'recognized-toggle'` always renders as split.
 */
export type DropdownLayout = 'single' | 'split';

export interface ToolbarDropdownItem {
  type: 'dropdown';
  name: string;
  icon?: string;
  label?: string;
  tooltip?: string;
  /** Format key for "active" check; options may omit format when this is set. */
  format?: string;
  options: ToolbarDropdownOption[];
  behavior?: DropdownBehavior;
  /** Chrome: single trigger vs split apply+chevron. Default `'single'`. */
  layout?: DropdownLayout;
  /** Display mode. Default `'list'`. */
  droptype?: DropdownType;
  extends?: string;
  /**
   * Width for the adaptive toolbar ruler (`Toolbar.getItemWidthPx`).
   * - number — absolute px
   * - `'established-wide'` — text split (Font Family), CSS `--scrider-toolbar-established-wide`
   * - `'established-narrow'` — compact split (Font Size / List / Indent), CSS `--scrider-toolbar-established-narrow`
   */
  widthHint?: number | 'established-wide' | 'established-narrow';
}

export interface ToolbarColorItem {
  type: 'color';
  name: string;
  command: string;
  icon?: string;
  tooltip?: string;
  format?: string;
  colors: string[];
  /**
   * Face tracking: `'established'` remembers last swatch pick (split chrome).
   * Default omit = recognized caret color on a single trigger (legacy).
   */
  behavior?: DropdownBehavior;
  /** Chrome: single trigger vs split apply+chevron. `established` always splits. */
  layout?: DropdownLayout;
  extends?: string;
}

export interface ToolbarSeparatorItem {
  type: 'separator';
  orientation?: 'vertical' | 'horizontal' | 'auto';
}

export interface ToolbarCustomItem {
  type: 'custom';
  name: string;
  extends?: string;
}

export type ToolbarItem =
  | ToolbarButtonItem
  | ToolbarDropdownItem
  | ToolbarColorItem
  | ToolbarSeparatorItem
  | ToolbarCustomItem;

// ---------------------------------------------------------------------------
// Toolbar group & control
// ---------------------------------------------------------------------------

export interface ToolbarControl {
  type: 'button';
  name: string;
  icon?: string;
  tooltip?: string;
}

export interface ToolbarGroup {
  type?: 'group';
  name: string;
  items?: ToolbarItem[];
  order?: number;
  priority?: number;
  control?: ToolbarControl;
  extends?: string;
}

// ---------------------------------------------------------------------------
// Toolbar config (resolved)
// ---------------------------------------------------------------------------

export interface ToolbarConfig {
  groups: ToolbarGroup[];
  overflow?: ToolbarGroup[];
  settings?: ToolbarGroup[];
  customBlocks?: Record<string, ToolbarGroup[]>;
}

/**
 * Raw toolbar config input (from JSON / user).
 * Resolved to ToolbarConfig via resolveToolbarConfig.
 */
export type ToolbarConfigInput = Record<string, unknown>;
