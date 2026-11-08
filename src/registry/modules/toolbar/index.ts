// Toolbar module — types, keys, registry, default config

export type {
  DisabledWhenRule,
  ToolbarButtonItem,
  ToolbarDropdownOption,
  ToolbarDropdownItem,
  DropdownBehavior,
  DropdownLayout,
  ToolbarColorItem,
  ToolbarSeparatorItem,
  ToolbarCustomItem,
  ToolbarItem,
  ToolbarControl,
  ToolbarGroup,
  ToolbarConfig,
  ToolbarConfigInput,
} from './types';

export { BUTTON_KEYS, DROPDOWN_KEYS, COLOR_KEYS, GROUP_KEYS } from './toolbarKeys';

export {
  ToolbarModuleRegistry,
  sortGroupsByOrder,
  type GlobalResolve,
} from './ToolbarModuleRegistry';

export { defaultToolbar } from './defaultToolbar';

export type {
  CompactResolve,
  CompactLevel,
  CompactToolbarOptions,
} from './compactToolbarConfig';
export { compactToolbarConfig } from './compactToolbarConfig';
