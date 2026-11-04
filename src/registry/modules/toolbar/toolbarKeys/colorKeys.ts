import type { ToolbarColorItem } from '../types';

// ---------------------------------------------------------------------------
// Color keys
// ---------------------------------------------------------------------------

export const COLOR_KEYS: Record<string, ToolbarColorItem> = {
  textColor: {
    type: 'color',
    name: 'textColor',
    command: 'setColor',
    icon: 'color',
    tooltip: 'Text Color',
    format: 'color',
    // Last picked swatch; action re-applies without opening the palette.
    behavior: 'established',
    colors: [
      '#000000',
      '#434343',
      '#666666',
      '#999999',
      '#e03131',
      '#c2255c',
      '#9c36b5',
      '#6741d9',
      '#3b5bdb',
      '#1971c2',
      '#0c8599',
      '#099268',
      '#2f9e44',
      '#66a80f',
      '#f08c00',
      '#e8590c',
    ],
  },
  bgColor: {
    type: 'color',
    name: 'bgColor',
    command: 'setBackground',
    icon: 'background',
    tooltip: 'Background Color',
    format: 'background',
    behavior: 'established',
    colors: [
      '#ffffff',
      '#f8f9fa',
      '#e9ecef',
      '#dee2e6',
      '#ffc9c9',
      '#fcc2d7',
      '#eebefa',
      '#d0bfff',
      '#bac8ff',
      '#a5d8ff',
      '#99e9f2',
      '#96f2d7',
      '#b2f2bb',
      '#d8f5a2',
      '#ffec99',
      '#ffe8cc',
    ],
  },
};
