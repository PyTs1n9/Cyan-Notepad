# Project Memory — Qing Notepad

Long-term notes that persist across sessions. Daily work logs live beside this file.

## Standing conventions

### Every conversation uses `grill` + `architect` (mandatory)

Declared by the user on 2026-10-22 and written into `AGENTS.md` under
"Session Workflow (Required)":

1. **grill first.** Before non-trivial implementation, run the `grill` skill: ask intensity
   (浅问/常规/细问/深挖/拷打) if not given, ask in rounds using `❓ Q1｜标题` + `➡️ 建议`,
   record decisions to `docs/decisions-<topic>.md` when a decision log is wanted, end with
   已确定 / 暂未确定 / 下一步 and wait for confirmation.
2. **architect when a technical choice appears.** New dependency, storage/sync layer, hosting,
   deployment, state model or build tooling → produce 2–3 options in the fixed template, verify
   prices/quotas on official pages, state `推荐：方案 X` + deciding reason, then append the
   chosen option to `docs/decisions-<topic>.md`.
3. **Order:** grill feeds architect; architect's open questions can bounce back to grill.
   Architect stays silent for ordinary feature/bug work with no stack decision.
4. **Skip grill** only for lookups, trivial fixes, or an explicit user instruction to act directly.

The stack itself is fixed (Tauri v2 + React 19 + TypeScript), so `architect` covers incremental
choices inside it, not greenfield re-selection.

## Project facts

- App: Qing Notepad, Windows desktop, Tauri v2 + React 19 + TypeScript, Zustand stores.
- Remote: GitHub `PyTs1n9/Cyan-Notepad` (repo rename still pending on GitHub side).
- Data lives in `<install-or-project-dir>/data/` — the single source of truth; never fall back
  to `%APPDATA%`.
- Git workflow: feature branches off `main`, small commits, squash-merge, tag versions.
