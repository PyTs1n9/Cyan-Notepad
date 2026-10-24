/**
 * Generates the workspace snapshots in `.workbuddy/preview/`.
 *
 * This machine has no GUI, so the workspace restyle cannot be checked in a
 * running window. These snapshots are the substitute evidence: the *real*
 * compiled stylesheet from `dist/assets` (so every utility class and every
 * `--color-*` token is the shipped one) plus `src/index.css` re-emitted with
 * `@theme` rewritten to `:root`, so the token values are read from source and
 * cannot silently lag behind the build.
 *
 * The markup is hand-written to mirror the component class names. It proves
 * layout, density, contrast, the container-query collapse and the dialogs; it
 * cannot prove hover placement, drag behaviour or a live Yjs connection.
 *
 * Run: npm run build && node scripts/gen-workspace-preview.mjs
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, ".workbuddy", "preview");

/* ------------------------------------------------------------------ styles */

const assetsDir = join(root, "dist", "assets");
let compiled = null;
try {
  const candidates = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".css"))
    .map((name) => join(assetsDir, name));
  if (candidates.length) {
    // The newest build wins; a stale sheet would show stale utilities.
    candidates.sort((a, b) => readFileSync(b).length - readFileSync(a).length);
    compiled = readFileSync(candidates[0], "utf8");
  }
} catch {
  compiled = null;
}

if (!compiled) {
  console.error("dist/assets 下没有编译后的 CSS。先跑 `npm run build`，快照必须用构建产物。");
  process.exit(1);
}

// `@theme` is a Tailwind at-rule: a browser drops it. Rewriting it to `:root`
// keeps the variables, which is exactly what this snapshot needs to prove.
const source = readFileSync(join(root, "src", "index.css"), "utf8")
  .replace(/^@import\s+"tailwindcss";\s*/m, "")
  .replace(/@theme\s*{/, ":root {");

const pageCss = `
  html, body { margin: 0; }
  body {
    padding: 22px;
    background: #17171c;
    color: #e6e6ea;
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 18px;
  }
  .case { margin: 0; }
  .case > figcaption {
    margin-bottom: 8px;
    font-size: 12px;
    letter-spacing: 0.02em;
    color: #8b8b96;
  }
  .stage { padding: 10px; border-radius: 12px; background: var(--color-bg-shell); }
  .panel {
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: hidden;
    color: var(--color-text-primary);
    font-size: 14px;
  }
  .mock-strip {
    display: flex; align-items: center; gap: 8px; height: 36px; flex-shrink: 0;
    padding-inline: 12px;
    border-bottom: 1px solid var(--color-border);
    font-size: 13px; font-weight: 600;
  }
  .mock-strip span.muted { font-size: 11px; font-weight: 400; color: var(--color-text-muted); }
  .note { max-width: 720px; font-size: 12px; color: #9a9aa6; }
  .note code { font-family: ui-monospace, Consolas, monospace; }
  h2.section {
    flex-basis: 100%; margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #b9b9c4;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  /* Stand-in for the portalled context menu: same width and classes. */
  .mock-menu-wrap { position: relative; }
  .mock-menu {
    position: absolute; z-index: 5;
    width: 168px; padding: 6px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-bg-primary);
    box-shadow: 0 12px 28px rgb(0 0 0 / 22%);
  }
`;

/* ------------------------------------------------------------------- icons */

const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  "file-plus": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  "file-clock": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><circle cx="12" cy="15" r="3"/><path d="M12 13.6V15l1 1"/>',
  "file-check": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="m9 15 2 2 4-4"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  "user-plus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  "user-minus": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" x2="16" y1="11" y2="11"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};

const icon = (name, size = 14, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${extra}">${ICONS[name]}</svg>`;

/* -------------------------------------------------------------- components */

const avatar = (initial, tone = "accent") => `
  <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-bg-secondary text-[11px] font-semibold ${tone}">${initial}</span>`;

const emptyState = (iconName, title, description, action) => `
  <div class="flex flex-col items-center justify-center px-6 py-10 text-center">
    <div class="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-bg-secondary/60 text-text-muted">
      ${icon(iconName, 17)}
    </div>
    <p class="brand-face text-[15px] leading-snug text-text-primary">${title}</p>
    ${description ? `<p class="mt-1 max-w-[300px] text-xs leading-relaxed text-text-muted">${description}</p>` : ""}
    ${action ? `<button type="button" class="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent">${action}</button>` : ""}
  </div>`;

const statCard = (label, value, pending = false, iconName = "file-text") => `
  <div class="rounded-xl border border-border bg-bg-secondary/40 px-3.5 py-3">
    <div class="flex items-center gap-1.5 text-xs text-text-muted">
      ${icon(iconName, 12, "flex-shrink-0 opacity-70")}
      <span class="min-w-0 truncate">${label}</span>
      ${pending ? '<span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" title="待发布"></span>' : ""}
    </div>
    <div class="mt-1.5 text-2xl font-semibold leading-none tabular-nums text-text-primary">${value}</div>
  </div>`;

const recentRow = (title, tone, date) => `
  <li>
    <button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-primary/60">
      <span aria-hidden="true" class="h-1.5 w-1.5 flex-shrink-0 rounded-full ${tone}"></span>
      <span class="min-w-0 flex-1 truncate text-[13px] text-text-primary">${title}</span>
      <span class="flex-shrink-0 text-[11px] tabular-nums text-text-muted" title="最近更新">${date}</span>
    </button>
  </li>`;

const createCard = (title, subtitle, iconName) => `
  <button type="button" class="flat-create-trigger group flex min-h-12 items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary">
    <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">${icon(iconName, 15)}</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate leading-tight">${title}</span>
      <span class="mt-0.5 block truncate text-xs font-normal text-text-muted">${subtitle}</span>
    </span>
  </button>`;

const overviewPanel = ({ name, role, stats, recent, owner, viewer, width, empty }) => `
  <div class="panel workspace-overview flex min-h-0 flex-1 flex-col overflow-y-auto" style="width:${width}px">
    <div class="mock-strip">${name} <span class="muted">${stats[0]?.[1] ?? 0} 协作文档</span></div>
    <div class="mx-auto w-full max-w-[880px] px-5 py-5 sm:px-7 sm:py-6">
      <header class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 class="brand-face min-w-0 truncate text-[19px] leading-tight text-text-primary">${name}</h1>
            ${role ? `<span class="flex-shrink-0 rounded-full border border-accent/15 bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">${role}</span>` : ""}
          </div>
          <p class="mt-1 text-xs text-text-muted">${viewer
            ? "你在当前工作台中是阅读者，可以浏览但不能新建文档"
            : `${stats[0]?.[1] ?? 0} 协作文档 · 4 成员`}</p>
        </div>
        ${owner ? `<button type="button" class="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-text-secondary">
          ${icon("shield", 13, "text-accent")}管理工作台
        </button>` : ""}
      </header>

      ${empty
        ? `<section class="mt-5"><div class="rounded-xl border border-border bg-bg-secondary/40">
             ${emptyState("users", "还没有工作台", "创建一个工作台，或用邀请码加入一个")}
             <div class="workspace-overview-pair px-6 pb-6">
               ${createCard("创建工作台", "工作台名称", "plus")}
               ${createCard("加入工作台", "邀请码", "user-plus")}
             </div>
           </div></section>`
        : `<section class="workspace-overview-stats mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            ${stats.map(([label, value, pending, iconName]) => statCard(label, value, pending, iconName)).join("")}
          </section>

          <div class="workspace-overview-body mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section class="min-w-0 rounded-xl border border-border bg-bg-secondary/40">
              <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
                <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">最近编辑</h2>
                ${recent.length && !viewer
                  ? `<button type="button" class="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-accent">${icon("file-plus", 12)}新建云文档</button>`
                  : ""}
              </div>
              ${recent.length
                ? `<ul class="p-1.5">${recent.join("")}</ul>`
                : emptyState("file-plus", "还没有可显示的编辑记录", "新建一篇云文档，它会出现在这里", viewer ? "" : "新建云文档")}
            </section>

            <aside class="min-w-0 rounded-xl border border-border bg-bg-secondary/40">
              <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
                <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">成员</h2>
                <span class="text-[11px] font-semibold tabular-nums text-text-muted">4</span>
              </div>
              <div class="flex items-center gap-2.5 px-3.5 py-3">
                <div class="flex items-center -space-x-1.5">
                  ${avatar("P")}${avatar("L", "bg-bg-active text-text-secondary")}${avatar("M", "bg-bg-active text-text-secondary")}${avatar("W", "bg-bg-active text-text-secondary")}
                  <span class="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-bg-secondary bg-bg-active px-1 text-[11px] font-semibold tabular-nums text-text-secondary">+1</span>
                </div>
                <span class="ml-auto flex-shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">${role ?? "阅读者"}</span>
              </div>
            </aside>
          </div>

          ${owner
            ? `<section class="mt-3 rounded-xl border border-border bg-bg-secondary/40">
                 <div class="flex items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
                   <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">工作台管理</h2>
                   <span class="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
                     <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full bg-warning"></span>
                     <span class="tabular-nums">2</span>待发布
                   </span>
                 </div>
                 <div class="workspace-overview-actions px-3.5 py-3">
                   <div class="flex min-w-0 items-center gap-2">
                     <code class="min-w-0 flex-1 truncate rounded-lg border border-border bg-bg-primary/60 px-2.5 py-1.5 text-xs font-semibold tracking-[0.16em] text-text-primary">QING-8F2K</code>
                     <button type="button" class="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-text-secondary">
                       ${icon("copy", 12)}<span class="max-w-[7.5rem] truncate">复制邀请码</span>
                     </button>
                   </div>
                   <div class="flex items-center gap-2">
                     <button type="button" class="flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs text-text-secondary">${icon("users", 12)}权限管理</button>
                     <button type="button" class="flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs text-text-secondary">${icon("settings", 12)}工作台设置</button>
                   </div>
                 </div>
               </section>`
            : ""}
        `}
    </div>
  </div>`;

/* ------------------------------------------------------------------ sidebar */

const contextMenu = () => `
  <div class="mock-menu" style="left:118px; top:28px" role="menu">
    ${[["pencil", "重命名"], ["clock", "定时发布"], ["info", "文档详情"]]
      .map(([ic, label]) => `<button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-text-secondary hover:bg-bg-hover hover:text-accent">${icon(ic, 13)}${label}</button>`)
      .join("")}
    <div class="my-1 border-t border-border/70"></div>
    <button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-danger hover:bg-danger/10">${icon("trash", 13)}删除文档</button>
  </div>`;

const sidebarRow = ({ title, date, iconName, tone, active, menuOpen }) => `
  <div class="relative mb-0.5 rounded-lg">
    <button type="button" class="relative flex h-8 w-full items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left ${
      active
        ? "flat-active-row text-[13px] font-medium text-text-primary"
        : "text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
    }">
      ${active ? '<span class="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-accent"></span>' : ""}
      <span class="flex flex-shrink-0 items-center justify-center ${active ? "text-accent" : tone}" title="拖拽排序">${icon(iconName, 13)}</span>
      <span class="min-w-0 flex-1 truncate">${title}</span>
      <span class="flex-shrink-0 text-[10px] tabular-nums text-text-muted">${date}</span>
    </button>
    ${menuOpen ? contextMenu() : ""}
  </div>`;

const sidebarPanel = ({ withMenu = false } = {}) => `
  <div class="panel app-interactive-surface flex w-[240px] flex-col" style="height:470px">
    <div class="flex h-9 flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3">
      <h2 class="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">工作台</h2>
      <div class="flex flex-shrink-0 items-center gap-0.5">
        <span class="mr-1 text-[11px] font-semibold leading-none tabular-nums text-text-muted">3</span>
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-accent">${icon("plus", 14)}</button>
        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-accent">${icon("shield", 14)}</button>
      </div>
    </div>

    <div class="flex flex-shrink-0 items-center gap-1 px-2 pt-2">
      <span class="flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 text-[13px] font-medium text-text-primary">
        <span class="truncate">Qing 设计组</span>
        ${icon("chevron", 13, "flex-shrink-0 text-text-muted")}
      </span>
      <span class="flex-shrink-0 rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted">创建者</span>
    </div>

    <div role="group" class="flex flex-shrink-0 flex-wrap items-center gap-1 px-2 py-1.5">
      <button type="button" class="rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">全部</button>
      <button type="button" class="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-secondary">草稿</button>
      <button type="button" class="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-secondary">定时</button>
      <button type="button" class="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-secondary">已发布</button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
      <div class="relative mb-0.5 rounded-lg">
        <button type="button" class="relative flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text-primary">
          <span class="flex flex-shrink-0 items-center justify-center text-text-muted">${icon("dashboard", 13)}</span>
          <span class="min-w-0 flex-1 truncate">概览</span>
        </button>
      </div>
      ${sidebarRow({ title: "2026 Q3 设计评审纪要", date: "10/24", iconName: "file-clock", tone: "text-warning", active: true })}
      ${sidebarRow({ title: "协作接入方案（草案）", date: "10/22", iconName: "file-text", tone: "text-text-muted", menuOpen: withMenu })}
      ${sidebarRow({ title: "发布节奏与角色分工", date: "9/30", iconName: "file-check", tone: "text-success" })}
    </div>

    <div class="grid flex-shrink-0 grid-cols-2 gap-1 border-t border-border px-2 py-2">
      <button type="button" class="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-xs text-text-secondary">${icon("plus", 13, "flex-shrink-0")}<span class="truncate">创建工作台</span></button>
      <button type="button" class="flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-xs text-text-secondary">${icon("user-plus", 13, "flex-shrink-0")}<span class="truncate">加入工作台</span></button>
    </div>
  </div>`;

/* ------------------------------------------------------------------- editor */

const editorToolbarPanel = (width) => `
  <div class="panel flex flex-col" style="width:${width}px">
    <div class="mock-strip">Q3 设计评审 · 会议纪要 <span class="muted">3 协作文档</span></div>
    <div class="workspace-editor-toolbar relative z-20 flex flex-nowrap items-center gap-1 overflow-hidden px-5 py-0.5">
      <div class="relative grid h-8 shrink-0 grid-cols-3 items-center overflow-hidden rounded-full bg-bg-secondary p-0.5" style="width:124px">
        <button type="button" class="relative z-10 flex h-7 items-center justify-center rounded-full text-text-secondary">${icon("file-text", 15)}</button>
        <button type="button" class="relative z-10 flex h-7 items-center justify-center rounded-full text-text-secondary">${icon("cloud", 15)}</button>
        <button type="button" class="relative z-10 flex h-7 items-center justify-center rounded-full bg-accent text-on-accent">${icon("settings", 15)}</button>
      </div>
      <span aria-hidden="true" class="mx-1 h-5 w-px shrink-0 bg-border/70"></span>
      <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">${icon("file-text", 15)}</button>
      <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary">${icon("copy", 15)}</button>
      <div class="flex-1"></div>
      <div class="flex min-w-0 flex-nowrap items-center gap-1.5 text-xs text-text-muted">
        <div class="flex flex-shrink-0 items-center gap-1.5">
          <span class="flex h-8 min-w-[124px] items-center justify-between gap-2 rounded-lg border border-accent/25 bg-accent-light px-2.5 text-xs font-semibold text-accent">
            <span class="flex min-w-0 items-center gap-1.5">${icon("shield", 13, "flex-shrink-0 text-accent")}<span class="min-w-0 truncate">成员可读</span></span>
            ${icon("chevron", 13, "flex-shrink-0 text-text-muted")}
          </span>
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-success/20 bg-success/10 text-success">${icon("file-text", 14)}</button>
        </div>
        <span aria-hidden="true" class="mx-0.5 h-4 w-px flex-shrink-0 bg-border/60"></span>
        <div class="flex min-w-0 items-center gap-2">
          <button type="button" class="flex flex-shrink-0 items-center gap-1 rounded-md text-success">${icon("cloud", 12)}<span class="workspace-status-text">网络良好 · 42 ms</span></button>
          <span class="min-w-0 max-w-[10rem] truncate text-success" title="已保存到云端">已保存到云端</span>
          <button type="button" class="flex flex-shrink-0 items-center gap-2">
            <span class="flex flex-shrink-0 items-center gap-1">${icon("users", 12)}<span class="workspace-status-text">在线成员</span><span class="tabular-nums">3</span></span>
            <span class="workspace-avatars flex items-center -space-x-1">
              ${avatar("P")}${avatar("L", "bg-bg-active text-text-secondary")}${avatar("M", "bg-bg-active text-text-secondary")}
            </span>
          </button>
        </div>
      </div>
    </div>
    <div class="px-5 py-3 text-xs text-text-muted">卡宽 320 / 520 / 900px 下的降级表现。</div>
  </div>`;

const networkPopoverPanel = () => `
  <div class="panel" style="width:336px">
    <div class="mock-strip">网络浮层 <span class="muted">悬停 / 聚焦后</span></div>
    <div class="p-4">
      <div class="rounded-xl border border-border bg-bg-primary p-3 text-text-primary shadow-xl">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-semibold">网络历史</span>
          <span class="flex items-center gap-1.5">
            <span class="rounded bg-bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">WebSocket</span>
            <span class="text-[11px] text-success">网络良好 · 42 ms</span>
          </span>
        </div>
        <div class="relative h-[58px] overflow-hidden rounded-lg border border-border bg-bg-secondary/50">
          <svg viewBox="0 0 240 58" preserveAspectRatio="none" class="h-full w-full" aria-hidden="true">
            <line x1="5" x2="235" y1="13" y2="13" stroke="var(--color-border)" stroke-dasharray="3 4" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <line x1="5" x2="235" y1="34" y2="34" stroke="var(--color-border)" stroke-dasharray="3 4" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <path d="M5,44 L25,38 L45,46 L65,41 L85,49 L105,36 L125,42 L145,30 L165,39 L185,33 L205,45 L225,35 L235,31" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
            <circle cx="235" cy="31" r="2.6" fill="var(--color-accent)"></circle>
            <line x1="145" x2="145" y1="44" y2="53" stroke="var(--color-danger)" stroke-width="1.5" stroke-linecap="round"></line>
          </svg>
        </div>
        <div class="mt-1.5 flex items-center gap-3 text-[10px] tabular-nums text-text-muted">
          <span class="flex items-center gap-1"><i class="h-1.5 w-1.5 rounded-full bg-success"></i>&lt; 38 ms</span>
          <span class="flex items-center gap-1"><i class="h-1.5 w-1.5 rounded-full bg-warning"></i>38–100 ms</span>
          <span class="flex items-center gap-1"><i class="h-1.5 w-1.5 rounded-full bg-danger"></i>&gt; 100 ms</span>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-1.5">
          ${[["当前", "42 ms"], ["平均", "46 ms"], ["最慢", "78 ms"]].map(([label, value]) => `
            <div class="rounded-lg bg-bg-secondary/60 px-2 py-1.5 text-center">
              <div class="text-[11px] text-text-muted">${label}</div>
              <div class="mt-0.5 text-[11px] font-semibold tabular-nums text-text-primary">${value}</div>
            </div>`).join("")}
        </div>
        <div class="mt-1.5 flex items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
          <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning"></span>
          <span class="min-w-0 truncate">同步积压 · 1.2 s</span>
        </div>
        <div class="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-[11px]">
          <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning"></span>
          <span class="min-w-0 truncate font-medium text-warning">修改已安全保存在本机，连接恢复后会自动同步</span>
        </div>
      </div>
    </div>
  </div>`;

/* ------------------------------------------------------------------ dialogs */

const memberRow = (name, role, first, current = false, isOwnerRow = false) => `
  <div class="flex items-center gap-2.5 px-3 py-2 ${first ? "" : "border-t border-border"}">
    <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-[11px] font-semibold text-accent">${name.slice(0, 1).toUpperCase()}</span>
    <span class="min-w-0 flex-1 truncate text-[13px] text-text-primary">${name}${current ? `<span class="ml-1.5 text-[11px] text-text-muted">(你)</span>` : ""}</span>
    ${isOwnerRow
      ? `<span class="shrink-0 rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-semibold text-text-muted">${role}</span>`
      : `<span class="flex h-7 min-w-[104px] items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-2 text-[11px] text-text-secondary">${role}${icon("chevron", 11, "text-text-muted")}</span>
         <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-danger/10 hover:text-danger">${icon("user-minus", 13)}</button>`}
  </div>`;

const documentPermissionRow = (title, hint, access, first) => `
  <div class="flex items-center gap-2.5 px-3 py-2 ${first ? "" : "border-t border-border"}">
    <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-bg-secondary text-text-muted">${icon("file-text", 13)}</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[13px] font-medium text-text-primary">${title}</span>
      <span class="mt-0.5 block truncate text-[11px] text-text-muted">${hint}</span>
    </span>
    <span class="flex h-7 min-w-[132px] items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-2 text-[11px] text-text-secondary">${access}${icon("chevron", 11, "text-text-muted")}</span>
  </div>`;

const manageHeader = (subtitle, activeTab) => `
  <div class="flex flex-shrink-0 items-center gap-2.5 border-b border-border bg-bg-sidebar/45 px-4 py-3">
    <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">${icon("shield", 16)}</span>
    <div class="min-w-0 flex-1">
      <div class="flex min-w-0 items-center gap-2">
        <h2 class="truncate text-sm font-semibold text-text-primary">Qing 设计组</h2>
        <span class="flex-shrink-0 rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">创建者</span>
      </div>
      <p class="mt-0.5 truncate text-[11px] text-text-muted">${subtitle}</p>
    </div>
    <button type="button" class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary">${icon("x", 15)}</button>
  </div>

  <div class="grid flex-shrink-0 grid-cols-2 border-b border-border bg-bg-sidebar/20 px-4">
    <button type="button" class="relative flex h-11 items-center justify-center gap-2 text-xs font-semibold ${activeTab === "permissions" ? "text-accent" : "text-text-muted"}">
      ${icon("shield", 14)}权限管理${activeTab === "permissions" ? '<span class="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent"></span>' : ""}
    </button>
    <button type="button" class="relative flex h-11 items-center justify-center gap-2 text-xs font-semibold ${activeTab === "settings" ? "text-accent" : "text-text-muted"}">
      ${icon("settings", 14)}工作台设置${activeTab === "settings" ? '<span class="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-accent"></span>' : ""}
    </button>
  </div>`;

const manageDialog = () => `
  <div class="panel flex flex-col" style="width:672px; height:620px">
    ${manageHeader("统一管理成员角色与每篇文档的阅读范围", "permissions")}
    <div class="flex min-h-0 flex-1 flex-col px-4">
      <div class="flex h-full min-h-0 flex-col">
        <div class="grid flex-shrink-0 grid-cols-3 gap-2 pt-4">
          ${[["创建者", "1"], ["编辑者", "2"], ["阅读者", "1"]].map(([role, count]) => `
            <div class="rounded-xl border border-border bg-bg-secondary/40 px-3 py-2">
              <div class="text-[11px] text-text-muted">${role}</div>
              <div class="mt-0.5 text-xl font-semibold leading-none tabular-nums text-text-primary">${count}</div>
            </div>`).join("")}
        </div>

        <section class="flex-shrink-0 border-b border-border py-4">
          <div class="mb-2.5 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-text-primary">成员权限</h3>
              <p class="mt-0.5 text-xs leading-relaxed text-text-muted">成员角色决定可编辑还是只读，创建者唯一</p>
            </div>
            <span class="flex-shrink-0 rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-muted">4</span>
          </div>
          <div class="max-h-[200px] overflow-y-auto rounded-xl border border-border [scrollbar-gutter:stable]">
            ${memberRow("PyTsING", "创建者", true, true, true)}
            ${memberRow("Lina", "编辑者", false)}
            ${memberRow("Ming", "编辑者", false)}
            ${memberRow("Wei", "阅读者", false)}
          </div>
        </section>

        <section class="flex min-h-0 flex-1 flex-col overflow-hidden py-4">
          <div class="mb-2.5 flex flex-shrink-0 items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-text-primary">文档权限</h3>
              <p class="mt-0.5 text-xs leading-relaxed text-text-muted">逐篇设置谁可以阅读</p>
            </div>
            <span class="flex-shrink-0 rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-muted">3</span>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border [scrollbar-gutter:stable]">
            ${documentPermissionRow("2026 Q3 设计评审纪要", "仅创建者与管理者可见", "创建者 + 管理者", true)}
            ${documentPermissionRow("协作接入方案（草案）", "全体成员可读", "全体成员", false)}
            ${documentPermissionRow("发布节奏与角色分工", "全体成员可读", "全体成员", false)}
          </div>
        </section>
      </div>
    </div>
    <div class="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span class="hidden text-xs text-text-muted sm:block">统一管理成员角色与每篇文档的阅读范围</span>
      <button type="button" class="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary">完成</button>
    </div>
  </div>`;

const manageSettingsDialog = () => `
  <div class="panel flex flex-col" style="width:672px; height:560px">
    ${manageHeader("工作台设置", "settings")}
    <div class="flex min-h-0 flex-1 flex-col px-4">
      <div class="min-h-0 flex-1 overflow-y-auto pb-1 pr-1 [scrollbar-gutter:stable]">
        <section class="border-b border-border py-5">
          <div class="mb-3">
            <h3 class="text-sm font-semibold text-text-primary">修改工作台名称</h3>
            <p class="mt-1 text-xs leading-relaxed text-text-muted">仅工作台创建者可以修改名称</p>
          </div>
          <div class="flex items-center gap-2">
            <input value="Qing 设计组" class="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none" />
            <button type="button" class="flex h-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-on-accent opacity-50">保存名称</button>
          </div>
        </section>

        <section class="border-b border-border py-5">
          <h3 class="text-sm font-semibold text-text-primary">分享工作台</h3>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <code class="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-sm font-semibold tracking-[0.16em] text-text-primary">QING-8F2K</code>
            <button type="button" class="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-medium text-on-accent">${icon("copy", 12)}复制邀请码</button>
            <button type="button" class="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-text-secondary">${icon("refresh", 12)}重新生成</button>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <label class="text-xs font-medium text-text-secondary">新成员权限</label>
            <span class="flex h-8 min-w-[104px] items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-2.5 text-xs text-text-primary">编辑者${icon("chevron", 12, "text-text-muted")}</span>
          </div>
        </section>
      </div>
    </div>
    <div class="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" class="flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-danger hover:bg-danger/10">${icon("trash", 13)}删除工作台</button>
      <button type="button" class="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary">完成</button>
    </div>
  </div>`;

/* -------------------------------------------------------------------- page */

const stage = (theme, caption, inner) => `
  <figure class="case">
    <figcaption>${theme} · ${caption}</figcaption>
    <div class="stage theme-${theme}">${inner}</div>
  </figure>`;

const page = (title, sections) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${compiled}</style>
<style>${source}</style>
<style>${pageCss}</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>
`;

const fullStats = [
  ["文档", "3", false, "file-text"],
  ["草稿", "2", true, "file-text"],
  ["定时", "1", false, "file-text"],
  ["已发布", "0", false, "file-text"],
];

const emptyStats = [
  ["文档", "0", false, "file-text"],
  ["草稿", "0", false, "file-text"],
  ["定时", "0", false, "file-text"],
  ["已发布", "0", false, "file-text"],
];

const recentRows = [
  recentRow("2026 Q3 设计评审纪要", "bg-warning", "2026/10/24"),
  recentRow("协作接入方案（草案）", "bg-text-muted/60", "2026/10/22"),
  recentRow("发布节奏与角色分工", "bg-success", "2026/9/30"),
];

const overviewSections = [
  '<h2 class="section">概览 · 宽卡（统计 4 列、成员在右侧）</h2>',
  stage("blue", "820px", overviewPanel({ name: "Qing 设计组", role: "创建者", stats: fullStats, recent: recentRows, owner: true, width: 820 })),
  stage("dark", "820px", overviewPanel({ name: "Qing 设计组", role: "创建者", stats: fullStats, recent: recentRows, owner: true, width: 820 })),
  '<h2 class="section">概览 · 窄卡 480px（480 以下由容器护栏强制单列）</h2>',
  stage("blue", "480px", overviewPanel({ name: "Qing 设计组", role: "创建者", stats: fullStats, recent: recentRows, owner: true, width: 480 })),
  stage("dark", "480px", overviewPanel({ name: "Qing 设计组", role: "创建者", stats: fullStats, recent: recentRows, owner: true, width: 480 })),
];

const emptySections = [
  '<h2 class="section">无工作台 · 概览骨架 + 创建/加入引导</h2>',
  stage("blue", "820px", overviewPanel({ name: "工作台", stats: [[0]], recent: [], owner: false, viewer: false, empty: true, width: 820 })),
  stage("dark", "820px", overviewPanel({ name: "工作台", stats: [[0]], recent: [], owner: false, viewer: false, empty: true, width: 820 })),
  '<h2 class="section">有工作台 · 0 文档（最近编辑换成 EmptyState，带新建入口）</h2>',
  stage("blue", "820px", overviewPanel({ name: "新工作台", role: "创建者", recent: [], owner: true, width: 820, stats: emptyStats })),
  stage("dark", "820px", overviewPanel({ name: "新工作台", role: "创建者", recent: [], owner: true, width: 820, stats: emptyStats })),
];

const readonlySections = [
  '<h2 class="section">阅读者 · 无 owner 区、无任何新建入口、顶部一行只读说明</h2>',
  stage("blue", "820px", overviewPanel({ name: "Qing 设计组", role: "阅读者", stats: fullStats, recent: recentRows, owner: false, viewer: true, width: 820 })),
  stage("dark", "820px", overviewPanel({ name: "Qing 设计组", role: "阅读者", stats: fullStats, recent: recentRows, owner: false, viewer: true, width: 820 })),
  '<h2 class="section">阅读者 · 0 文档（EmptyState 不带 action，避免假入口）</h2>',
  stage("blue", "620px", overviewPanel({ name: "Qing 设计组", role: "阅读者", recent: [], owner: false, viewer: true, width: 620, stats: emptyStats })),
];

const sidebarSections = [
  '<h2 class="section">左栏 · 与 note / todo 同一骨架：36px 标题栏 + 32px 行 + chips 筛选</h2>',
  stage("blue", "240px", sidebarPanel()),
  stage("dark", "240px", sidebarPanel()),
  stage("yellow", "240px", sidebarPanel()),
  stage("green", "240px", sidebarPanel()),
  '<h2 class="section">左栏 · 右键菜单（行内不再有 hover 才出现的按钮）</h2>',
  stage("blue", "240px", sidebarPanel({ withMenu: true })),
  stage("dark", "240px", sidebarPanel({ withMenu: true })),
  '<h2 class="section">正文工具栏 · 两组收纳，窄卡只留图标与数字</h2>',
  stage("blue", "900px", editorToolbarPanel(900)),
  stage("blue", "520px", editorToolbarPanel(520)),
  stage("dark", "900px", editorToolbarPanel(900)),
  stage("dark", "320px", editorToolbarPanel(320)),
  '<h2 class="section">网络浮层 · 图例与曲线同口径、三数、积压只在有积压时出现</h2>',
  stage("blue", "336px", networkPopoverPanel()),
  stage("dark", "336px", networkPopoverPanel()),
  `<p class="note">快照说明：样式来自 <code>dist/assets</code> 的编译产物 + <code>src/index.css</code>
   （<code>@theme</code> 已改写为 <code>:root</code>）。结构类名与组件一致，卡片底色用
   <code>--color-bg-primary</code> 代替真实磨砂层；悬停浮层的定位、拖拽与协作连接不在此快照范围。</p>`,
];

/* ------------------------------------------------- unified dialog family */

/**
 * Mirror of `Layout/ModalShell.tsx`: one header (32px tile + 14px title +
 * 11px caption), one body, one footer bar. Every dialog in the app renders
 * through this shape now, so the snapshot shows the family, not one dialog.
 */
const shellPanel = ({ title, description, iconNode, tone = "accent", body, footer, footerStart = "", width = 460 }) => {
  const toneTile = {
    accent: "bg-accent-light text-accent",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/10 text-danger",
    success: "bg-success/10 text-success",
  }[tone];
  return `
    <div class="panel app-modal-panel flex w-full flex-col overflow-hidden rounded-xl border border-border bg-bg-primary text-text-primary" style="width:${width}px">
      <header class="flex flex-shrink-0 items-center gap-2.5 border-b border-border bg-bg-sidebar/45 px-4 py-3">
        ${iconNode ? `<span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${toneTile}">${iconNode}</span>` : ""}
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-text-primary">${title}</h2>
          ${description ? `<p class="mt-0.5 truncate text-[11px] leading-4 text-text-muted">${description}</p>` : ""}
        </div>
        <button type="button" class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary">${icon("x", 15)}</button>
      </header>
      ${body ?? ""}
      ${footer ? `<footer class="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-2">${footerStart}</div>
        <div class="flex flex-shrink-0 items-center justify-end gap-2">${footer}</div>
      </footer>` : ""}
    </div>`;
};

const footerButtons = (confirmLabel, tone = "accent") => `
  <button type="button" class="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary">取消</button>
  <button type="button" class="h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
    tone === "danger" ? "bg-danger text-on-danger hover:bg-danger/90" : tone === "warning" ? "bg-warning text-on-warning hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover"
  }">${confirmLabel}</button>`;

const publicationDialog = () => shellPanel({
  title: "管理发布状态",
  description: "草稿",
  icon: icon("clock", 16),
  size: 460,
  body: `
    <div class="px-4 py-4">
      <p class="rounded-lg bg-bg-secondary/65 px-3 py-2 text-xs leading-relaxed text-text-muted">发布后全体成员可读；下架后仅创建者与管理者可见。</p>
      <button type="button" class="mt-3 flex w-full items-center gap-3 rounded-xl border border-accent/20 bg-accent-light px-3 py-3 text-left text-sm font-medium text-accent">
        <span class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">${icon("file-check", 14)}</span>
        立即发布
      </button>
      <div class="mt-4">
        <div class="mb-2 text-xs font-medium text-text-secondary">定时发布时间</div>
        <div class="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary">2026/10/28 09:00</div>
      </div>
    </div>`,
  footer: footerButtons("定时发布"),
});

const dialogSections = [
  '<h2 class="section">统一弹窗族 · 同一头部（32px 图标块 + 14px 标题 + 11px 说明）、同一页脚、同一种阴影与遮罩</h2>',
  stage("blue", "400px", shellPanel({
    title: "删除云文档",
    description: "2026 Q3 设计评审纪要",
    iconNode: icon("trash", 16),
    tone: "danger",
    body: '<div class="px-4 py-4"><p class="text-sm leading-relaxed text-text-secondary">是否删除“2026 Q3 设计评审纪要”？删除后无法恢复。</p></div>',
    footer: footerButtons("删除", "danger"),
  })),
  stage("dark", "400px", shellPanel({
    title: "转让创建者",
    description: "Lina",
    iconNode: icon("shield", 16),
    tone: "warning",
    body: '<div class="px-4 py-4"><p class="text-sm leading-relaxed text-text-secondary">转让后你将失去创建者权限，且该操作不可撤销。</p></div>',
    footer: footerButtons("确认转让", "warning"),
  })),
  stage("blue", "460px", shellPanel({
    title: "新建云文档",
    iconNode: icon("file-plus", 16),
    body: '<div class="px-4 py-4"><label class="text-xs font-medium text-text-secondary">文档名称</label><input value="" placeholder="文档名称" class="mt-2 h-8 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none" /></div>',
    footer: footerButtons("新建云文档"),
  })),
  stage("dark", "560px", shellPanel({
    title: "回收站",
    description: "已删除的笔记会在这里保留一段时间",
    iconNode: icon("trash", 16),
    width: 560,
    body: '<div class="min-h-0 flex-1 overflow-hidden p-3"><div class="space-y-1.5"><div class="group flex items-center gap-3 rounded-lg border border-border bg-bg-secondary/40 px-3 py-2.5"><div class="min-w-0 flex-1"><div class="truncate text-sm font-medium text-text-primary">产品调研笔记</div><div class="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted"><span>产品</span><span>·</span><span>2026/10/21 14:03</span><span>·</span><span>30 天</span></div></div><div class="flex items-center gap-1"><button type="button" class="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary">还原</button><button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-danger">#</button></div></div></div></div>',
    footer: footerButtons("清空回收站"),
    footerStart: '<span class="text-xs tabular-nums text-text-muted">3 · 回收站</span>',
  })),
  '<h2 class="section">管理工作台 · 权限管理（成员清单自滚，文档权限表占主滚动区）</h2>',
  stage("blue", "680px", manageDialog()),
  stage("dark", "680px", manageDialog()),
  '<h2 class="section">管理工作台 · 工作台设置（整页可滚动，不再被固定高度裁掉）</h2>',
  stage("blue", "680px", manageSettingsDialog()),
  '<h2 class="section">应用级子窗口 · 更新 / 密码找回也走同一套头部与页脚</h2>',
  stage("blue", "400px", shellPanel({
    title: "发现新版本",
    description: "最新版 v0.4.2 可用",
    iconNode: icon("file-plus", 16),
    body: '<div class="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-secondary/40 px-3 py-2.5 text-xs"><div><div class="text-text-muted">当前版本</div><div class="mt-0.5 font-medium tabular-nums text-text-primary">v0.4.1</div></div><div><div class="text-text-muted">最新版本</div><div class="mt-0.5 font-medium tabular-nums text-accent">v0.4.2</div></div></div>',
    footer: '<button type="button" class="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-text-muted">不再提醒</button><button type="button" class="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-text-secondary">稍后</button><button type="button" class="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent">立即更新</button>',
  })),
  stage("dark", "400px", shellPanel({
    title: "重置密码",
    description: "qing@example.com",
    iconNode: icon("shield", 16),
    tone: "warning",
    body: '<div class="px-4 py-4"><label class="text-xs font-medium text-text-secondary">新密码</label><input value="" class="mt-2 h-8 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none" /></div>',
    footer: '<button type="button" class="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary">取消</button><button type="button" class="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent">重置密码</button>',
  })),
  '<h2 class="section">发布弹窗 · 同一套头部与页脚</h2>',
  stage("blue", "460px", publicationDialog()),
];


mkdirSync(outDir, { recursive: true });
const files = [
  ["workspace-overview.html", "工作台概览 · 宽卡与窄卡", overviewSections],
  ["workspace-empty.html", "工作台 · 无工作台 / 0 文档", emptySections],
  ["workspace-readonly.html", "工作台 · 阅读者", readonlySections],
  ["workspace-sidebar.html", "工作台 · 左栏 / 右键菜单 / 工具栏 / 网络浮层", sidebarSections],
  ["workspace-dialogs.html", "工作台 · 管理工作台弹窗", dialogSections],
];

for (const [file, title, sections] of files) {
  writeFileSync(join(outDir, file), page(title, sections), "utf8");
  console.log(`.workbuddy/preview/${file}`);
}
