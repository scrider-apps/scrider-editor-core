import type { ToolbarGroup } from '../types';
import { BUTTON_KEYS } from './buttonKeys';
import { DROPDOWN_KEYS } from './dropdownKeys';
import { COLOR_KEYS } from './colorKeys';

// ---------------------------------------------------------------------------
// Group keys — named groups for sublimation: "history" → full group object
// ---------------------------------------------------------------------------

export const GROUP_KEYS: Record<string, ToolbarGroup> = {
  font: {
    name: 'font',
    priority: 1,
    items: [DROPDOWN_KEYS.fontFamily!, DROPDOWN_KEYS.fontSize!],
  },
  history: {
    name: 'history',
    priority: 1,
    items: [BUTTON_KEYS.undo!, BUTTON_KEYS.redo!],
  },
  inline: {
    name: 'inline',
    priority: 1,
    items: [BUTTON_KEYS.bold!, BUTTON_KEYS.italic!, BUTTON_KEYS.underline!, BUTTON_KEYS.strike!],
  },
  'code-link': {
    name: 'code-link',
    priority: 2,
    items: [BUTTON_KEYS.code!, BUTTON_KEYS.link!],
  },
  heading: {
    name: 'heading',
    priority: 2,
    items: [BUTTON_KEYS.textIndent!, DROPDOWN_KEYS.heading!, DROPDOWN_KEYS.lineSpacing!],
  },
  block: {
    name: 'block',
    priority: 3,
    items: [BUTTON_KEYS.contents!, BUTTON_KEYS.blockquote!],
  },
  list: {
    name: 'list',
    priority: 3,
    items: [DROPDOWN_KEYS.listType!, DROPDOWN_KEYS.indent!],
  },
  align: {
    name: 'align',
    priority: 4,
    items: [DROPDOWN_KEYS.align!],
  },
  color: {
    name: 'color',
    priority: 5,
    items: [COLOR_KEYS.textColor!, COLOR_KEYS.bgColor!],
  },
  misc: {
    name: 'misc',
    priority: 6,
    items: [BUTTON_KEYS.removeFormat!],
  },
  overflow: {
    name: 'overflow',
    items: [
      BUTTON_KEYS.subscript!,
      BUTTON_KEYS.superscript!,
      BUTTON_KEYS.kbd!,
      BUTTON_KEYS.specialCharacters!,
      BUTTON_KEYS.mark!,
    ],
    control: {
      type: 'button',
      name: 'overflow',
      icon: 'moreHorizontal',
      tooltip: 'More options',
    },
  },
  settings: {
    type: 'group',
    name: 'settings',
    control: {
      type: 'button',
      name: 'settings',
      icon: 'settings',
      tooltip: 'Settings',
    },
  },
};
