import type { ToolbarDropdownItem } from '../types';

// ---------------------------------------------------------------------------
// Dropdown keys
// ---------------------------------------------------------------------------

export const DROPDOWN_KEYS: Record<string, ToolbarDropdownItem> = {
  heading: {
    type: 'dropdown',
    name: 'heading',
    icon: 'heading1',
    tooltip: 'Heading',
    /**
     * `format: 'header'` is required so the "Paragraph"
     * default option (with `formatValue: null`) becomes active when no
     * heading attribute is set. Without it, `isOptionActive` short-circuits
     * to `false` and the trigger always falls back to the H1 icon.
     */
    format: 'header',
    // Last picked level (not caret-follow). Auto-split chrome via established.
    behavior: 'established',
    options: [
      {
        label: 'Paragraph',
        icon: 'paragraph',
        // Match textIndent / first-line visual weight (pilcrow reads large at 18).
        iconSize: 16,
        command: 'setHeader',
        args: [null],
        formatValue: null,
      },
      {
        label: 'Heading 1',
        icon: 'heading1',
        command: 'setHeader',
        args: [1],
        formatValue: 1,
      },
      {
        label: 'Heading 2',
        icon: 'heading2',
        command: 'setHeader',
        args: [2],
        formatValue: 2,
      },
      {
        label: 'Heading 3',
        icon: 'heading3',
        command: 'setHeader',
        args: [3],
        formatValue: 3,
        dividerAfter: true,
      },
      {
        label: 'Heading 4',
        icon: 'heading4',
        command: 'setHeader',
        args: [4],
        formatValue: 4,
        extendedOnly: true,
      },
      {
        label: 'Heading 5',
        icon: 'heading5',
        command: 'setHeader',
        args: [5],
        formatValue: 5,
        extendedOnly: true,
      },
      {
        label: 'Heading 6',
        icon: 'heading6',
        command: 'setHeader',
        args: [6],
        formatValue: 6,
        extendedOnly: true,
      },
    ],
  },
  align: {
    type: 'dropdown',
    name: 'align',
    icon: 'alignLeft',
    tooltip: 'Alignment',
    format: 'align',
    // Recognized toggle: face + pressed follow caret (paragraph / Simple Table
    // column via table-col-align overrides); clears on re-detect like Bold.
    behavior: 'recognized-toggle',
    options: [
      {
        label: 'Left',
        icon: 'alignLeft',
        command: 'setAlign',
        args: [null],
        format: 'align',
        formatValue: null,
      },
      {
        label: 'Center',
        icon: 'alignCenter',
        command: 'setAlign',
        args: ['center'],
        format: 'align',
        formatValue: 'center',
      },
      {
        label: 'Right',
        icon: 'alignRight',
        command: 'setAlign',
        args: ['right'],
        format: 'align',
        formatValue: 'right',
      },
      {
        label: 'Justify',
        icon: 'alignJustify',
        command: 'setAlign',
        args: ['justify'],
        format: 'align',
        formatValue: 'justify',
      },
    ],
  },
  listType: {
    type: 'dropdown',
    name: 'listType',
    icon: 'listOrdered',
    tooltip: 'List',
    format: 'list',
    // Last picked list type; indent is its own established split next door.
    behavior: 'established',
    // Same compact split as Font Size — ruler and CSS share this token.
    widthHint: 'established-narrow',
    options: [
      {
        label: 'Ordered List',
        icon: 'listOrdered',
        command: 'setList',
        args: ['ordered'],
        format: 'list',
        formatValue: 'ordered',
      },
      {
        label: 'Bullet List',
        icon: 'listBullet',
        command: 'setList',
        args: ['bullet'],
        format: 'list',
        formatValue: 'bullet',
      },
      {
        label: 'Task List',
        icon: 'listCheck',
        command: 'setList',
        args: ['unchecked'],
        format: 'list',
        formatValue: 'unchecked',
      },
    ],
  },
  indent: {
    type: 'dropdown',
    name: 'indent',
    icon: 'indentIncrease',
    tooltip: 'Indent',
    // Action pair (no caret format). Face = last pick; default Increase.
    behavior: 'established',
    // Icon split: count one compact control, not button+chevron extra.
    widthHint: 'established-narrow',
    options: [
      {
        label: 'Increase Indent',
        icon: 'indentIncrease',
        command: 'increaseIndent',
        tooltip: 'Increase Indent (Tab)',
        formatValue: 'increase',
      },
      {
        label: 'Decrease Indent',
        icon: 'indentDecrease',
        command: 'decreaseIndent',
        tooltip: 'Decrease Indent (Shift+Tab)',
        formatValue: 'decrease',
      },
    ],
  },
  fontFamily: {
    type: 'dropdown',
    name: 'fontFamily',
    label: 'System',
    tooltip: 'Font Family',
    format: 'font',
    // Split chrome + caret detection (recognized): face tracks font at cursor;
    // action re-applies it; chevron opens the list.
    layout: 'split',
    // Named preset — CSS + adaptive ruler share the same width token.
    widthHint: 'established-wide',
    options: [
      {
        label: 'System',
        command: 'setFont',
        args: [null],
        format: 'font',
        formatValue: null,
      },
      { label: 'Arial', command: 'setFont', args: ['Arial'], format: 'font', formatValue: 'Arial' },
      {
        label: 'Calibri',
        command: 'setFont',
        args: ['Calibri'],
        format: 'font',
        formatValue: 'Calibri',
      },
      {
        label: 'Cambria',
        command: 'setFont',
        args: ['Cambria'],
        format: 'font',
        formatValue: 'Cambria',
      },
      {
        label: 'Comic Sans MS',
        command: 'setFont',
        args: ['Comic Sans MS'],
        format: 'font',
        formatValue: 'Comic Sans MS',
      },
      {
        label: 'Courier New',
        command: 'setFont',
        args: ['Courier New'],
        format: 'font',
        formatValue: 'Courier New',
      },
      {
        label: 'Garamond',
        command: 'setFont',
        args: ['Garamond'],
        format: 'font',
        formatValue: 'Garamond',
      },
      {
        label: 'Georgia',
        command: 'setFont',
        args: ['Georgia'],
        format: 'font',
        formatValue: 'Georgia',
      },
      {
        label: 'Helvetica',
        command: 'setFont',
        args: ['Helvetica'],
        format: 'font',
        formatValue: 'Helvetica',
      },
      {
        label: 'Impact',
        command: 'setFont',
        args: ['Impact'],
        format: 'font',
        formatValue: 'Impact',
      },
      { label: 'Inter', command: 'setFont', args: ['Inter'], format: 'font', formatValue: 'Inter' },
      { label: 'Lato', command: 'setFont', args: ['Lato'], format: 'font', formatValue: 'Lato' },
      {
        label: 'Montserrat',
        command: 'setFont',
        args: ['Montserrat'],
        format: 'font',
        formatValue: 'Montserrat',
      },
      {
        label: 'Open Sans',
        command: 'setFont',
        args: ['Open Sans'],
        format: 'font',
        formatValue: 'Open Sans',
      },
      {
        label: 'Oswald',
        command: 'setFont',
        args: ['Oswald'],
        format: 'font',
        formatValue: 'Oswald',
      },
      {
        label: 'Palatino',
        command: 'setFont',
        args: ['Palatino'],
        format: 'font',
        formatValue: 'Palatino',
      },
      {
        label: 'Roboto',
        command: 'setFont',
        args: ['Roboto'],
        format: 'font',
        formatValue: 'Roboto',
      },
      {
        label: 'Tahoma',
        command: 'setFont',
        args: ['Tahoma'],
        format: 'font',
        formatValue: 'Tahoma',
      },
      {
        label: 'Times New Roman',
        command: 'setFont',
        args: ['Times New Roman'],
        format: 'font',
        formatValue: 'Times New Roman',
      },
      {
        label: 'Trebuchet MS',
        command: 'setFont',
        args: ['Trebuchet MS'],
        format: 'font',
        formatValue: 'Trebuchet MS',
      },
      {
        label: 'Verdana',
        command: 'setFont',
        args: ['Verdana'],
        format: 'font',
        formatValue: 'Verdana',
      },
    ],
  },
  fontSize: {
    type: 'dropdown',
    name: 'fontSize',
    label: '12',
    tooltip: 'Font Size',
    format: 'size',
    // Split chrome + caret detection (recognized): face tracks size at cursor;
    // action re-applies it; chevron opens the list.
    layout: 'split',
    // Named preset — CSS + adaptive ruler share the same width token.
    widthHint: 'established-narrow',
    options: [
      { label: 'Auto', command: 'setFontSize', args: [null], format: 'size', formatValue: null },
      { label: '8', command: 'setFontSize', args: ['8pt'], format: 'size', formatValue: '8pt' },
      { label: '10', command: 'setFontSize', args: ['10pt'], format: 'size', formatValue: '10pt' },
      { label: '11', command: 'setFontSize', args: ['11pt'], format: 'size', formatValue: '11pt' },
      { label: '12', command: 'setFontSize', args: ['12pt'], format: 'size', formatValue: '12pt' },
      { label: '14', command: 'setFontSize', args: ['14pt'], format: 'size', formatValue: '14pt' },
      { label: '16', command: 'setFontSize', args: ['16pt'], format: 'size', formatValue: '16pt' },
      { label: '18', command: 'setFontSize', args: ['18pt'], format: 'size', formatValue: '18pt' },
      { label: '20', command: 'setFontSize', args: ['20pt'], format: 'size', formatValue: '20pt' },
      { label: '22', command: 'setFontSize', args: ['22pt'], format: 'size', formatValue: '22pt' },
      { label: '24', command: 'setFontSize', args: ['24pt'], format: 'size', formatValue: '24pt' },
      { label: '26', command: 'setFontSize', args: ['26pt'], format: 'size', formatValue: '26pt' },
      { label: '32', command: 'setFontSize', args: ['32pt'], format: 'size', formatValue: '32pt' },
      { label: '36', command: 'setFontSize', args: ['36pt'], format: 'size', formatValue: '36pt' },
      { label: '48', command: 'setFontSize', args: ['48pt'], format: 'size', formatValue: '48pt' },
      { label: '72', command: 'setFontSize', args: ['72pt'], format: 'size', formatValue: '72pt' },
      { label: '96', command: 'setFontSize', args: ['96pt'], format: 'size', formatValue: '96pt' },
    ],
  },
  lineSpacing: {
    type: 'dropdown',
    name: 'lineSpacing',
    icon: 'lineSpacing',
    tooltip: 'Interval',
    format: 'scrider-line-height',
    options: [
      {
        label: 'Inherit',
        command: 'setLineSpacing',
        args: [null],
        formatValue: null,
      },
      {
        label: '1',
        command: 'setLineSpacing',
        args: ['1'],
        formatValue: '1',
      },
      {
        label: '1.15',
        command: 'setLineSpacing',
        args: ['1.15'],
        formatValue: '1.15',
      },
      {
        label: '1.5',
        command: 'setLineSpacing',
        args: ['1.5'],
        formatValue: '1.5',
      },
      {
        label: '2',
        command: 'setLineSpacing',
        args: ['2'],
        formatValue: '2',
      },
    ],
  },
};
