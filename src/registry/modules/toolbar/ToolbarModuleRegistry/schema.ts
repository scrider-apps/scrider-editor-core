// ---------------------------------------------------------------------------
// Strict schema: allowed fields per entity type
// ---------------------------------------------------------------------------

export const RESERVED_ROOT_KEYS = new Set([
  'configuration',
  'extends',
  'groups',
  'overflow',
  'settings',
]);

export const ALLOWED_GROUP_FIELDS = new Set([
  'type',
  'name',
  'items',
  'order',
  'priority',
  'control',
  'extends',
]);

export const ALLOWED_ITEM_FIELDS: Record<string, Set<string>> = {
  button: new Set([
    'type',
    'name',
    'command',
    'args',
    'icon',
    'iconSize',
    'label',
    'tooltip',
    'format',
    'formatValue',
    'promptMessage',
    'disabledWhen',
    'extends',
  ]),
  dropdown: new Set([
    'type',
    'name',
    'icon',
    'label',
    'tooltip',
    'format',
    'options',
    'behavior',
    'layout',
    'droptype',
    'extends',
    'widthHint',
  ]),
  color: new Set([
    'type',
    'name',
    'command',
    'icon',
    'tooltip',
    'format',
    'colors',
    'behavior',
    'layout',
    'extends',
  ]),
  separator: new Set(['type', 'orientation']),
  custom: new Set(['type', 'name', 'extends']),
};

export const DROPDOWN_BEHAVIOR_VALUES = new Set<string>([
  'established',
  'recognized',
  'recognized-toggle',
]);
export const DROPDOWN_LAYOUT_VALUES = new Set<string>(['single', 'split']);
export const DROPDOWN_DROPTYPE_VALUES = new Set<string>(['list', 'sections', 'accordions']);
export const DROPDOWN_WIDTH_HINT_PRESETS = new Set<string>([
  'established-wide',
  'established-narrow',
]);
