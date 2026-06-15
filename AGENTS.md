# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

BaiQingTodo is a Windows desktop app built with **Tauri v2 + React 18 + TypeScript**. Core features:
- **Todo List** — CRUD, three-level priority, filter tabs (all/active/completed)
- **Rich Text Notepad** — TipTap WYSIWYG editor + MD split-pane mode with live preview
- **Theme System** — 4 built-in presets (dark/blue/yellow/green) + custom palette + up to 5 saved user presets
- **i18n** — Full Chinese/English UI translation

## Commands

```bash
npm run tauri dev     # Full desktop dev mode (Vite + Tauri)
npm run dev           # Frontend-only Vite server (port 8787)
npx tsc --noEmit      # TypeScript check
npm run build         # Frontend production build
npm run tauri build   # Windows installer build
```

## Critical Environment Setup

Rust compilation on Windows requires MSVC linker. Set these env vars BEFORE `tauri dev`/`tauri build`:

```powershell
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:USERPROFILE\.cargo\bin;$env:Path"
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$env:INCLUDE = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\include;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\shared;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt"
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"
```

> Path version numbers (e.g. `14.44.35207`, `10.0.26100.0`) must match the actual installed Build Tools.

Vite dev server port is **8787** (not the default 1420).

## Architecture

### Frontend (`src/`)

**State Management** — 4 Zustand stores in `src/stores/`:
| Store | Purpose |
|-------|---------|
| `todoStore.ts` | Todo items, filter state, CRUD |
| `noteStore.ts` | Note metadata, active note ID, tag filter, delete |
| `fontStore.ts` | Built-in + imported custom fonts |
| `settingsStore.ts` | Theme type, language, custom colors, saved presets (max 5), `THEME_COLORS` preset map |

**i18n** — `src/utils/i18n.ts` exports `t(lang, key)` and `tWithParams(lang, key, params)`. All UI strings are defined in `TranslationKeys`. When adding new UI text, add keys to both `zh` and `en` objects. Components use `useSettingsStore(s => s.lang)` to get current language.

**Data Persistence** — `src/utils/storage.ts` wraps Tauri fs plugin. All data under `%APPDATA%/com.pytsingtodo.app/data/`:
```
data/
├── todos.json          # Todo items
├── fonts.json          # Custom font registry
├── settings.json       # Theme, lang, customColors, savedPresets
└── notes/
    ├── index.json      # Note metadata (id/title/tags/dates) — fast listing
    └── <uuid>.md       # Note content (stored as markdown or HTML)
```

Note content files use `.md` extension but may contain HTML (TipTap output) or Markdown (from MD mode). The `index.json` avoids loading content for list display.

**Theme System** — CSS custom properties in `src/index.css`. Default is blue. Theme classes: `.theme-dark`, `.theme-blue`, `.theme-yellow`, `.theme-green`. Custom theme applies inline `style.setProperty` on `documentElement` in `App.tsx`. `setTheme()` in `settingsStore.ts` auto-syncs `customColors` when a preset is clicked. Saved presets persist in `settings.json`.

**Path Alias** — `@/` → `src/` (in `vite.config.ts` and `tsconfig.json`).

**Styling** — Tailwind CSS v4 via `@tailwindcss/vite`. All colors reference CSS variables (e.g. `bg-bg-primary`, `text-text-muted`, `bg-accent`). Do NOT hardcode color hex values in components.

### Backend (`src-tauri/`)

- Tauri v2 with plugins: `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-opener`
- No custom Rust commands; all file I/O uses fs plugin from frontend
- Permissions in `src-tauri/capabilities/default.json`
- `Cargo.toml` defines `[lib] name = "pytsing_to_do_lib"` — `main.rs` MUST call `pytsing_to_do_lib::run()` with that exact name

### Key Components

| Component | Role |
|-----------|------|
| `App.tsx` | Root: data loading, theme application, sidebar resize drag, settings modal, import MD handler |
| `Sidebar.tsx` | Navigation, note list (with delete), tag filter, import Markdown button, settings button, dynamic width |
| `TodoView.tsx` | Todo CRUD, priority select, filter tabs |
| `NoteEditor.tsx` | TipTap editor (WYSIWYG mode) + textarea/preview split (MD mode), mode toggle, toolbar toggle, sync scroll, turndown/marked conversion |
| `Toolbar.tsx` | Formatting toolbar — works in both WYSIWYG and MD modes (inserts Markdown syntax in MD mode) |
| `SettingsModal.tsx` | 4 theme presets grid, custom color picker (5 fields), save/select preset split buttons with dropdown |

### Data Flow

- Notes stored as HTML in `.md` files. Index in `index.json`.
- Switching to MD mode: TipTap HTML → `turndown` → pure Markdown in textarea
- Switching to WYSIWYG mode: Markdown → `marked` → HTML set in TipTap
- Auto-save: 800ms debounce via `setTimeout` refs
- Settings (theme/lang/customColors/savedPresets): auto-saved on change, loaded on mount
- Sidebar width: mouse drag via `mousedown`/`mousemove`/`mouseup` events in `App.tsx`

## Pitfalls & Important Details

- **Main entry mismatch**: `main.rs` must call `pytsing_to_do_lib::run()`, NOT `todolist_vibe_temp_lib` or any other name. This name comes from `Cargo.toml` `[lib] name`.
- **Named import**: `TextStyle` from `@tiptap/extension-text-style` requires named import, not default.
- **Binary file read**: Use `readFile` from `@tauri-apps/plugin-fs` (not deprecated `readBinaryFile`).
- **Permissions**: Tauri v2 fs permissions go in `capabilities/default.json`, NOT `tauri.conf.json`.
- **Theme colors**: Always use Tailwind's CSS-variable-based color tokens (e.g. `text-text-primary`). Never hardcode hex colors in component `className` strings — they won't update when theme changes.
- **i18n keys**: When adding new UI strings, both `zh` and `en` objects in `i18n.ts` MUST have the key. Missing keys cause compile errors.
- **Content format**: `saveNoteContent` stores raw markdown in MD mode, HTML in WYSIWYG mode. `loadNoteContent` needs to handle both.
- **Settings persist**: `saveSettings` in `App.tsx` includes `savedPresets` array; `loadSettingsState` casts the loaded JSON accordingly.
