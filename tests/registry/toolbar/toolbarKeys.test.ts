import { describe, it, expect } from 'vitest';
import {
  BUTTON_KEYS,
  DROPDOWN_KEYS,
  COLOR_KEYS,
  GROUP_KEYS,
} from '../../../src/registry/modules/toolbar/toolbarKeys';
import { HEADER_SIZE_PRESETS, BASE_FONT_SIZE_PT } from '../../../src/queries/headerDefaults';

/** Narrow a resolved toolbar item (never a bare separator here) for `.name` assertions. */
type NamedItem = { type: string; name: string; tooltip?: string };
const at = (group: { items?: readonly unknown[] } | undefined, i: number): NamedItem =>
  group!.items![i] as NamedItem;

describe('toolbarKeys', () => {
  describe('BUTTON_KEYS', () => {
    it('contains undo with disabledWhen', () => {
      const undo = BUTTON_KEYS.undo;
      expect(undo).toBeDefined();
      expect(undo!.type).toBe('button');
      expect(undo!.command).toBe('undo');
      expect(undo!.disabledWhen).toBe('cannotUndo');
    });

    it('contains redo with disabledWhen', () => {
      const redo = BUTTON_KEYS.redo;
      expect(redo).toBeDefined();
      expect(redo!.disabledWhen).toBe('cannotRedo');
    });

    it('contains bold without disabledWhen', () => {
      const bold = BUTTON_KEYS.bold;
      expect(bold).toBeDefined();
      expect(bold!.command).toBe('toggleBold');
      expect(bold!.format).toBe('bold');
      expect(bold!.disabledWhen).toBeUndefined();
    });

    it('all buttons have type "button" and required fields', () => {
      for (const [key, btn] of Object.entries(BUTTON_KEYS)) {
        expect(btn.type).toBe('button');
        expect(btn.name).toBe(key);
        expect(typeof btn.command).toBe('string');
      }
    });
  });

  describe('DROPDOWN_KEYS', () => {
    it('contains heading with options', () => {
      const heading = DROPDOWN_KEYS.heading;
      expect(heading).toBeDefined();
      expect(heading!.type).toBe('dropdown');
      expect(heading!.options.length).toBeGreaterThanOrEqual(2);
    });

    it('heading / listType / indent use established; align uses recognized-toggle', () => {
      expect(DROPDOWN_KEYS.heading!.behavior).toBe('established');
      expect(DROPDOWN_KEYS.align!.behavior).toBe('recognized-toggle');
      expect(DROPDOWN_KEYS.align!.format).toBe('align');
      expect(DROPDOWN_KEYS.listType!.behavior).toBe('established');
      expect(DROPDOWN_KEYS.listType!.format).toBe('list');
      expect(DROPDOWN_KEYS.listType!.options.map((o) => o.formatValue)).toEqual([
        'ordered',
        'bullet',
        'unchecked',
      ]);
      expect(DROPDOWN_KEYS.indent!.behavior).toBe('established');
      expect(DROPDOWN_KEYS.indent!.options.map((o) => o.formatValue)).toEqual([
        'increase',
        'decrease',
      ]);
      expect(DROPDOWN_KEYS.listType!.widthHint).toBe('established-narrow');
      expect(DROPDOWN_KEYS.indent!.widthHint).toBe('established-narrow');
    });

    it('contains align with options', () => {
      const align = DROPDOWN_KEYS.align;
      expect(align).toBeDefined();
      expect(align!.options.length).toBe(4);
    });

    /**
     * Heading sizes must be detectable by the toolbar.
     * Every value used by ANY size-grid preset has to appear as a
     * `formatValue` in the fontSize dropdown options; otherwise the
     * dropdown shows its fallback label ("12") instead of the heading
     * size when that preset is active.
     */
    it('fontSize options cover every non-base value across all header presets', () => {
      // BASE_FONT_SIZE_PT values (e.g. Word H5/H6 = '12pt') are intentionally
      // not injected into the snapshot by EditorStore — the "12" option
      // (formatValue:null) already lights up for them. Only check explicit
      // non-base values are present as dropdown options.
      const fontSize = DROPDOWN_KEYS.fontSize;
      expect(fontSize).toBeDefined();
      const values = new Set(fontSize!.options.map((o) => o.formatValue));
      for (const preset of ['scrider', 'google', 'word', 'browser', 'githubEm'] as const) {
        for (const level of [1, 2, 3, 4, 5, 6] as const) {
          const expected = HEADER_SIZE_PRESETS[preset][level];
          if (expected === BASE_FONT_SIZE_PT) continue;
          expect(values.has(expected)).toBe(true);
        }
      }
    });

    it('heading dropdown has format="header" so Paragraph default is detectable', () => {
      const heading = DROPDOWN_KEYS.heading;
      expect(heading!.format).toBe('header');
    });

    it('heading dropdown options 1-7 cover Paragraph + H1..H6', () => {
      const heading = DROPDOWN_KEYS.heading;
      expect(heading!.options).toHaveLength(7);
      const labels = heading!.options.map((o) => o.label);
      expect(labels).toEqual([
        'Paragraph',
        'Heading 1',
        'Heading 2',
        'Heading 3',
        'Heading 4',
        'Heading 5',
        'Heading 6',
      ]);
    });

    it('Paragraph option uses formatValue:null sentinel and paragraph icon', () => {
      const heading = DROPDOWN_KEYS.heading;
      const paragraph = heading!.options[0]!;
      expect(paragraph.label).toBe('Paragraph');
      expect(paragraph.formatValue).toBeNull();
      expect(paragraph.icon).toBe('paragraph');
    });

    it('textIndent toggle and lineSpacing dropdown are registered', () => {
      expect(BUTTON_KEYS.textIndent).toMatchObject({
        type: 'button',
        command: 'toggleTextIndent',
        icon: 'textFirstLine',
        format: 'scrider-text-indent',
      });
      expect(DROPDOWN_KEYS.lineSpacing).toMatchObject({
        type: 'dropdown',
        icon: 'lineSpacing',
        format: 'scrider-line-height',
      });
      expect(DROPDOWN_KEYS.lineSpacing!.options.map((o) => o.label)).toEqual([
        'Inherit',
        '1',
        '1.15',
        '1.5',
        '2',
      ]);
      expect(DROPDOWN_KEYS.lineSpacing!.options[0]!.formatValue).toBeNull();
      expect(DROPDOWN_KEYS.lineSpacing!.options[1]!.formatValue).toBe('1');
    });

    it('H4/H5/H6 are flagged extendedOnly; H3 has dividerAfter', () => {
      const opts = DROPDOWN_KEYS.heading!.options;
      expect(opts[3]!.dividerAfter).toBe(true); // H3
      expect(opts[4]!.extendedOnly).toBe(true); // H4
      expect(opts[5]!.extendedOnly).toBe(true); // H5
      expect(opts[6]!.extendedOnly).toBe(true); // H6
      // H1, H2, H3, Paragraph must NOT be extendedOnly
      expect(opts[0]!.extendedOnly).toBeUndefined();
      expect(opts[1]!.extendedOnly).toBeUndefined();
      expect(opts[2]!.extendedOnly).toBeUndefined();
      expect(opts[3]!.extendedOnly).toBeUndefined();
    });

    it('default options (Left/System/Auto) use formatValue:null sentinel', () => {
      expect(DROPDOWN_KEYS.align!.options[0]!.formatValue).toBeNull();
      expect(DROPDOWN_KEYS.fontFamily!.options[0]!.formatValue).toBeNull();
      const autoSize = DROPDOWN_KEYS.fontSize!.options[0]!;
      expect(autoSize.label).toBe('Auto');
      expect(autoSize.formatValue).toBeNull();
      expect(DROPDOWN_KEYS.fontSize!.options[1]!.formatValue).toBe('8pt');
      expect(DROPDOWN_KEYS.fontSize!.options.find((o) => o.formatValue === '12pt')).toBeDefined();
    });

    it('fontFamily / fontSize use named widthHint presets for the adaptive ruler', () => {
      expect(DROPDOWN_KEYS.fontFamily!.layout).toBe('split');
      expect(DROPDOWN_KEYS.fontFamily!.widthHint).toBe('established-wide');
      expect(DROPDOWN_KEYS.fontSize!.layout).toBe('split');
      expect(DROPDOWN_KEYS.fontSize!.widthHint).toBe('established-narrow');
      expect(DROPDOWN_KEYS.listType!.widthHint).toBe('established-narrow');
      expect(DROPDOWN_KEYS.indent!.widthHint).toBe('established-narrow');
    });
  });

  describe('COLOR_KEYS', () => {
    it('contains textColor with palette', () => {
      const tc = COLOR_KEYS.textColor;
      expect(tc).toBeDefined();
      expect(tc!.type).toBe('color');
      expect(tc!.colors.length).toBeGreaterThan(0);
    });

    it('textColor / bgColor use established split', () => {
      expect(COLOR_KEYS.textColor!.behavior).toBe('established');
      expect(COLOR_KEYS.bgColor!.behavior).toBe('established');
    });

    it('contains bgColor with palette', () => {
      const bg = COLOR_KEYS.bgColor;
      expect(bg).toBeDefined();
      expect(bg!.colors.length).toBeGreaterThan(0);
    });
  });

  describe('GROUP_KEYS', () => {
    it('contains history group with undo/redo', () => {
      const g = GROUP_KEYS.history;
      expect(g).toBeDefined();
      expect(g!.name).toBe('history');
      expect(g!.items).toHaveLength(2);
      expect(at(g, 0).name).toBe('undo');
      expect(at(g, 1).name).toBe('redo');
    });

    it('heading group contains heading dropdown, text indent, and line spacing', () => {
      const g = GROUP_KEYS.heading;
      expect(g!.items).toHaveLength(3);
      expect(at(g, 0).name).toBe('textIndent');
      expect(at(g, 1).name).toBe('heading');
      expect(at(g, 2).name).toBe('lineSpacing');
    });

    it('block group is contents list and quote', () => {
      const g = GROUP_KEYS.block;
      expect(g!.items).toHaveLength(2);
      expect(at(g, 0).name).toBe('contents');
      expect(at(g, 1).name).toBe('blockquote');
    });

    it('list group is listType + indent established dropdowns', () => {
      const g = GROUP_KEYS.list;
      expect(g!.items).toHaveLength(2);
      expect(at(g, 0).name).toBe('listType');
      expect(at(g, 0).type).toBe('dropdown');
      expect(at(g, 1).name).toBe('indent');
      expect(at(g, 1).type).toBe('dropdown');
    });

    it('all groups have name, and items or type:group', () => {
      for (const [key, group] of Object.entries(GROUP_KEYS)) {
        expect(group.name).toBe(key);
        const hasItems = Array.isArray(group.items) && group.items.length > 0;
        const hasType = group.type === 'group';
        expect(hasItems || hasType).toBe(true);
      }
    });

    it('group priority follows ascending order of definition', () => {
      const priorities = Object.values(GROUP_KEYS).map((g) => g.priority ?? Infinity);
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i]!).toBeGreaterThanOrEqual(priorities[i - 1]!);
      }
    });
  });
});
