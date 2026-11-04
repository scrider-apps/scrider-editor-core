# @scrider/editor-core

Framework-agnostic editor core for Delta documents. State, selection, commands, history.

## Overview

`@scrider/editor-core` is the model layer of the [Scrider](https://github.com/scrider-apps) editor. It holds the editor state (document, selection, stored marks, undo history) and transforms it with pure commands, on top of [`@scrider/delta`](https://github.com/scrider-apps/scrider-delta) and [`@scrider/formatter`](https://github.com/scrider-apps/scride-formatter). There is no DOM and no UI framework inside: a view layer such as `@scrider/editor-react` renders the state and feeds user input back as commands.

## Key Features

- **Immutable state** — `EditorState` with Delta document, selection, stored marks and document metadata
- **Pure commands** — inline marks, headings, lists, indent, alignment, code blocks, tables of contents, find/replace
- **History** — undo/redo with typing merge and configurable stack size
- **Clipboard** — copy, cut and paste through HTML with paste canonicalization (tables, lists, block embeds)
- **Keymap and input rules** — platform-agnostic shortcut matching and Markdown-style triggers (`**bold`**, `#` , `-` )
- **Registries** — module/plugin registries and a JSON-serializable toolbar config
- **Pluggable behavior** — `EditorBehavior` hooks let extensions own Enter, Backspace, Delete, Select All and indent inside their blocks
- **Dual format** — ESM + CJS builds
- **Strict TypeScript** — full type safety
- **Headless** — works in browser, Node.js, Web Workers

## Installation

```bash
npm install @scrider/editor-core @scrider/delta @scrider/formatter
# or
pnpm add @scrider/editor-core @scrider/delta @scrider/formatter
```

`handlePaste` parses HTML through `@scrider/formatter`. In the browser it uses the native DOM parser; in Node.js install `jsdom`:

```bash
pnpm add jsdom
```

## Quick Start

```typescript
import { Delta } from '@scrider/delta';
import {
  createEditorState,
  defaultCommands,
  defaultKeyMap,
  executeCommand,
  getActiveFormats,
  matchKeyBinding,
  toggleBold,
  undo,
} from '@scrider/editor-core';

// Create a state with "Hello" selected
let state = createEditorState({
  delta: new Delta().insert('Hello world\n'),
  selection: { index: 0, length: 5 },
});

// Run a command directly
state = toggleBold(state);
getActiveFormats(state); // → { bold: true }

// Or resolve it from a key event
const binding = matchKeyBinding(
  { key: 'b', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  defaultKeyMap,
);
if (binding) {
  const result = executeCommand(defaultCommands, binding.command, state);
  if (result) state = result.state; // bold toggled off
}

state = undo(state);
```

## API

### State

```typescript
import { createEditorState, applyEditorStateTransition } from '@scrider/editor-core';

const state = createEditorState({ delta, selection, config: { history: { maxStackSize: 200 } } });
```

`EditorState` is immutable. Every command returns a new state; unchanged input is returned as is.

### Commands

```typescript
import {
  toggleBold,
  setHeader,
  setList,
  insertText,
  splitBlock,
  undo,
  redo,
} from '@scrider/editor-core';

let next = setHeader(state, 2);
next = insertText(next, 'Title');
next = splitBlock(next);
```

A `Command` returns either an `EditorState` or a `CommandResult` with an optional `sideEffect` the host runs after applying the state. `defaultCommands` indexes all built-in commands by name for `executeCommand`.

### Queries

```typescript
import { getActiveFormats, getPlainText, canUndo, findMatches } from '@scrider/editor-core';
```

### Clipboard

```typescript
import { prepareCopy, handlePaste, handleCut } from '@scrider/editor-core';

const { html, text } = prepareCopy(state); // selection → clipboard payload
const next = handlePaste(state, html); // HTML → canonical Delta at the caret
```

### Keymap and Input Rules

```typescript
import {
  defaultKeyMap,
  matchKeyBinding,
  defaultInputRules,
  matchInputRule,
} from '@scrider/editor-core';
```

`KeyEvent` is a plain object (`key`, `ctrlKey`, `shiftKey`, `altKey`, `metaKey`), so the matcher has no DOM dependency.

### View Contract

`EditorView`, `SelectionBridge` and `PluginManager` describe what a UI adapter implements. `StringBridge` maps HTML offsets to Delta indexes without a DOM.

### Behaviors

An `EditorBehavior` changes how the structural commands act inside blocks an extension owns. Behaviors live in `state.config.behaviors` and run before the built-in logic, in order:

| Hook             | Runs in                                           |
| ---------------- | ------------------------------------------------- |
| `splitBlock`     | `splitBlock` (Enter)                              |
| `exitBlock`      | `exitBlock`                                       |
| `deleteBackward` | `deleteBackward` (Backspace) at a collapsed caret |
| `deleteForward`  | `deleteForward` (Delete) at a collapsed caret     |
| `selectAll`      | `selectAll`                                       |
| `indentLine`     | `increaseIndent` / `decreaseIndent`, per line     |

A hook returns the next state, the input state to block the command, or `null` to pass. The first non-null result wins. `indentLine` receives the line attributes and the direction and returns an attribute patch or `null`.

```typescript
import { createEditorState, getActiveFormats, type EditorBehavior } from '@scrider/editor-core';

const keepHeadings: EditorBehavior = {
  name: 'keep-headings',
  // Backspace at a heading does nothing; elsewhere the built-in logic runs.
  deleteBackward: (state) => (getActiveFormats(state).header ? state : null),
};

const state = createEditorState({ delta, config: { behaviors: [keepHeadings] } });
```

### Plugins

A `Plugin` bundles named commands and a behavior. `PluginManager` merges them for the host:

```typescript
import {
  PluginManager,
  PluginRegistry,
  createEditorState,
  defaultCommands,
  type Plugin,
} from '@scrider/editor-core';

const plugin: Plugin = {
  name: 'my-blocks',
  registry: new PluginRegistry('my-blocks'),
  commands: { insertMyBlock },
  behavior: keepHeadings,
};

const manager = new PluginManager([plugin]);
const commands = { ...defaultCommands, ...manager.getMergedCommands() };
const state = createEditorState({ delta, config: { behaviors: manager.getBehaviors() } });
```

## Ecosystem

```
@scrider/delta          Delta, OT (0 deps)
    ↑
@scrider/formatter      Schema + Conversion
    ↑
@scrider/editor-core    ← you are here (State + Commands)
    ↑
@scrider/editor-react   React WYSIWYG Component
```

## License

[MIT](./LICENSE)
