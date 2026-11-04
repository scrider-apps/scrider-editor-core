import type { ToolbarConfig } from './types';
import { GROUP_KEYS } from './toolbarKeys';

/**
 * Default toolbar configuration — single source of truth for layout.
 *
 * Layout:
 * [Undo][Redo] | [Font▾][Size▾] | [B][I][U][S] | [¶][H▾][↕▾] | [Code][Link] |
 * [Content][Quote] | [List▾][Indent▾] | [Align▾] | [Color][BgColor] | [Clear]  ←gap→  [...] [⚙]
 */
export const defaultToolbar: ToolbarConfig = {
  groups: [
    GROUP_KEYS.history!,
    GROUP_KEYS.font!,
    GROUP_KEYS.inline!,
    GROUP_KEYS.heading!,
    GROUP_KEYS['code-link']!,
    GROUP_KEYS.block!,
    GROUP_KEYS.list!,
    GROUP_KEYS.align!,
    GROUP_KEYS.color!,
    GROUP_KEYS.misc!,
  ],
  overflow: [GROUP_KEYS.overflow!],
  settings: [GROUP_KEYS.settings!],
};
