# AGENTS.md

This file helps AI coding agents quickly understand and work safely in this repository.

## Project Overview

Cyan Notepad is a Windows desktop app built with **Tauri v2 + React 19 + TypeScript**.

Core features:
- **Todo List**: CRUD, inline editing, drag reorder, three priority levels, status and priority filters.
- **Rich Text Notes**: TipTap WYSIWYG editor, Markdown source mode, split preview, import/export.
- **Sticky/Tile Windows**: independent always-on-top note windows created through Tauri webview windows.
- **Theme System**: dark/blue/yellow/green presets, custom palette, up to 5 saved custom presets.
- **i18n**: Chinese/English UI strings through a typed translation table.
- **System Integration**: custom title bar, tray icon, hide-to-tray close behavior, global shortcut.

## Commands

```bash
npm run dev           # Frontend-only Vite server, fixed port 8787
npm run tauri dev     # Full desktop dev mode: Vite + Tauri
npx tsc --noEmit      # TypeScript check
npm run build         # TypeScript + frontend production build
npm run tauri build   # Windows installer build through Tauri/NSIS
```

`npm run build` runs `tsc && vite build`; use `npx tsc --noEmit` when you only need type checking.

On Windows PowerShell, `npx tsc --noEmit` may be blocked by the local script execution policy because it resolves through `npx.ps1`. If this is the only type-check failure and the requested change does not otherwise depend on type-check output, do not keep retrying or escalate just for this; skip type checking and mention the policy block in the final response.

## Windows Build Environment

Rust/Tauri builds on Windows require the MSVC linker. Before `npm run tauri dev` or `npm run tauri build`, load the environment:

```powershell
. .\env.ps1
```

The explicit variables used by this project are:

```powershell
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:USERPROFILE\.cargo\bin;$env:Path"
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$env:INCLUDE = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\include;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\shared;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt"
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"
```

Version numbers such as `14.44.35207` and `10.0.26100.0` must match the local Visual Studio Build Tools / Windows SDK installation.

## Architecture

### Top-Level Structure

```text
src/                         React renderer source
src/components/Editor/       TipTap editor, Markdown mode, formatting toolbar
src/components/Layout/       Sidebar and custom title bar
src/components/Settings/     Settings and about modals
src/components/Sticky/       Editable always-on-top sticky note window
src/components/Tile/         Read-only note tile window
src/components/Todo/         Todo list view
src/stores/                  Zustand stores
src/types/                   Shared TypeScript types
src/utils/                   Storage, i18n, theme, shortcuts, window helpers
src-tauri/                   Tauri v2 Rust shell, config, capabilities, icons
public/                      Static renderer assets
```

### Entrypoints

- `src/main.tsx` chooses which React surface to render:
  - default: `<App />`
  - `?tile=1&noteId=...`: `<TileView />`
  - `?sticky=...`: `<StickyNote />`
- `src/App.tsx` owns app initialization, data loading, theme application, autosave wiring, sidebar resize/collapse, import handlers, settings/about modals, shortcut setup, and tile theme sync.
- `src-tauri/src/main.rs` must call `cyan_notepad_lib::run()`.
- `src-tauri/src/lib.rs` configures Tauri plugins, tray behavior, close-to-tray behavior, and the `quit_app` command.

## Frontend State

The app uses Zustand stores in `src/stores/`.

| Store | File | Responsibility |
| --- | --- | --- |
| Todo | `todoStore.ts` | Todo items, status filter, priority filter, CRUD, reorder, completion sorting |
| Notes | `noteStore.ts` | Note metadata, active note ID, search query, tag filter, add/update/delete |
| Fonts | `fontStore.ts` | Built-in font list plus imported custom fonts |
| Settings | `settingsStore.ts` | Theme, language, custom colors, saved presets, global shortcuts |

Shared types live in `src/types/index.ts`.

## Data Persistence

All persistence goes through `src/utils/storage.ts`, which wraps `@tauri-apps/plugin-fs`.

Data is stored under:

```text
%APPDATA%/com.cyan-notepad.app/data/
├── todos.json
├── fonts.json
├── settings.json
├── app-icon.png
└── notes/
    ├── index.json
    └── <uuid>.md
```

Important details:
- `notes/index.json` stores metadata only: `id`, `title`, `tags`, `createdAt`, `updatedAt`.
- Note content files use `.md` extension but may contain either raw Markdown or TipTap HTML.
- `loadNoteContent()` must tolerate both HTML and Markdown.
- `saveNoteContent()` writes the current editor payload directly.
- `App.tsx` autosaves todos, note index, fonts, and settings after initialization.
- Note editor/sticky note content uses an 800ms debounce pattern for save-related flows.

## Note Editor Flow

`src/components/Editor/NoteEditor.tsx` supports two modes:

- **WYSIWYG mode**: TipTap stores/edits HTML.
- **Markdown mode**: textarea source editor plus marked preview.

Conversions:
- WYSIWYG -> Markdown: `turndown`
- Markdown -> WYSIWYG/preview: `marked`

The editor guards against common race conditions:
- Saves the previous note when switching active notes.
- Clears the editor immediately before loading new note content.
- Discards stale `loadNoteContent()` results if the active note changed.
- Suppresses dirty-state changes during programmatic content loading.

`Toolbar.tsx` works in both modes:
- In WYSIWYG mode it calls TipTap commands.
- In Markdown mode it inserts/wraps Markdown or HTML fallback syntax directly in the textarea.

## Sticky And Tile Windows

The project creates extra Tauri webview windows from the frontend.

- `src/utils/stickyManager.ts`
  - Creates `sticky-*` windows with `/?sticky=<noteId>`.
  - Tracks open sticky windows in memory.
  - Sticky notes are editable, transparent, always-on-top by default, and save back to note content.
  - Sync events:
    - main editor -> sticky: `sticky:note-updated`
    - sticky -> main editor: `sticky:note-saved`
    - sticky close tracking: `sticky:closed`

- `src/utils/tile.ts`
  - Creates/focuses `tile-*` windows with `/?tile=1&noteId=<noteId>`.
  - Tile windows are read-only note previews.
  - Theme updates sync through `tile-theme-sync`.

Tauri capabilities must allow labels matching `main`, `sticky-*`, and `tile-*`.

## Theme System

Theme variables are defined in `src/index.css` through Tailwind CSS v4 `@theme` tokens and theme classes.

Theme presets:
- default/blue: no class or `.theme-blue`
- dark: `.theme-dark`
- yellow: `.theme-yellow`
- green: `.theme-green`
- custom: `.theme-custom` plus inline CSS variables

`src/utils/theme.ts` applies/removes classes and inline custom properties. `settingsStore.ts` owns `THEME_COLORS` and syncs `customColors` when preset themes are selected.

When changing component styles:
- Prefer existing Tailwind token classes such as `bg-bg-primary`, `text-text-muted`, `bg-accent`, `border-border`.
- Avoid hardcoded hex colors in component `className` strings because they will not follow themes.
- Inline `style={{ backgroundColor: ... }}` is acceptable for user-selected color swatches/previews and editor color commands.

## i18n

`src/utils/i18n.ts` exports:
- `t(lang, key)`
- `tWithParams(lang, key, params)`

Rules:
- Every UI string key must exist in the `TranslationKeys` type.
- Add each new key to both `zh` and `en`.
- Components should read the language from `useSettingsStore(s => s.lang)`.
- Missing translation keys should fail at compile time; do not bypass the typed table for ordinary UI text.

## Tauri Backend

Tauri v2 lives in `src-tauri/`.

Plugins used:
- `tauri-plugin-fs`
- `tauri-plugin-dialog`
- `tauri-plugin-opener`
- `tauri-plugin-global-shortcut`

Rust side responsibilities:
- Register plugins.
- Create system tray menu.
- Hide main window to tray on normal close.
- Exit only through the `quit_app` command or tray quit item.
- Provide the `quit_app` command invoked by the custom title bar.

There are no custom Rust file-I/O commands; frontend code uses Tauri plugins directly.

Critical backend details:
- `src-tauri/Cargo.toml` `[lib] name` is `cyan_notepad_lib`.
- `src-tauri/src/main.rs` must call `cyan_notepad_lib::run()`.
- Tauri v2 permissions live in `src-tauri/capabilities/default.json`, not in `tauri.conf.json`.
- `tauri.conf.json` uses `devUrl` `http://localhost:8787`; Vite is configured with fixed port `8787`.

## Path Alias

`@/` maps to `src/`.

Configured in:
- `vite.config.ts`
- `tsconfig.json`

Prefer `@/...` imports for app source modules where existing code does so.

## Development Guidelines For Agents

- Read the relevant store/component/util before editing; behavior is split between Zustand state, Tauri plugin calls, and React effects.
- Keep changes scoped. Do not refactor unrelated areas while fixing a feature.
- Preserve local user data formats under `%APPDATA%/com.cyan-notepad.app/data/`.
- Be careful with note content format: `.md` files are not guaranteed to be Markdown.
- When adding UI text, update both translations and use `t()`/`tWithParams()`.
- When adding Tauri APIs, update capabilities in `src-tauri/capabilities/default.json`.
- When adding new windows, ensure labels are covered by capabilities and route selection in `src/main.tsx`.
- When changing theme behavior, update both CSS variables/classes and `THEME_COLORS` if preset colors are involved.
- For frontend visuals, follow existing compact desktop-app patterns; this is not a landing page.
- Use `lucide-react` icons where applicable.

## Known Pitfalls

- `TextStyle` from `@tiptap/extension-text-style` is a named import.
- Use `readFile` from `@tauri-apps/plugin-fs` for binary files; do not use deprecated `readBinaryFile`.
- `saveNoteContent()` may store HTML in WYSIWYG mode and Markdown in Markdown mode.
- `noteStore.getFilteredNotes()` includes `note.content`, but note list metadata loaded from disk may not contain full content.
- Imported Markdown is converted to HTML before saving for WYSIWYG display.
- Sticky note edits save `innerHTML`, so they generally produce HTML content.
- `Toolbar.tsx` intentionally contains some hardcoded editor color values for text color commands; these are content formatting values, not theme tokens.
- `TodoView.tsx` priority badge colors are hardcoded Tailwind palette classes; update deliberately if theme-aware priority badges are required.
- Normal window close hides the app to tray. Use `quit_app` for true exit.
- Do not change the Tauri library name unless `main.rs` and Cargo config are changed together.

## Quick Mental Model

The renderer is the source of most behavior. `App.tsx` loads persisted JSON/files into Zustand, React components mutate Zustand, effects persist state back through `storage.ts`, and Tauri plugins provide dialogs, filesystem access, windows, tray integration, and global shortcuts. Notes are metadata in Zustand plus content on disk. Extra sticky/tile windows are separate React render paths selected by query parameters and synchronized with events.
