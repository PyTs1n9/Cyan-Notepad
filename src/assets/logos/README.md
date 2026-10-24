# Vendor marks

Source: `@lobehub/icons-static-svg` v1.98.0 — https://github.com/lobehub/lobe-icons
License: MIT — Copyright (c) 2023 LobeHub

These files are vendored rather than installed as a dependency: only the brands
mapped in `src/utils/ai/modelBrand.ts` are needed, and a package install rewrites
the whole `node_modules` tree (do not run `npm install` while the dev server is
running — it tears the hoisted packages on Windows).

Imported with `?raw` and inlined as markup. The mono marks are authored with
`fill="currentColor"` and must inherit the theme colour; as `<img>` they would
paint black and disappear on a dark theme.

To add a brand, fetch
`https://unpkg.com/@lobehub/icons-static-svg@1.98.0/icons/<name>.svg` (append
`-color` for the branded-colour variant where one exists), drop it here, then add
a rule to `BRAND_RULES`.
