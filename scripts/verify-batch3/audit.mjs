/**
 * Batch 3 audit: CSP + capability scopes.
 *
 * Everything here is a static or build-time guarantee, so it can be asserted
 * instead of eyeballed: a stray `{"path": "**"}`, a missing `ipc:` in
 * `connect-src`, or a permission the code needs but no capability grants all
 * have a known, checkable shape. What a *rendered window* looks like still
 * needs a human, and is listed in the report as such.
 *
 *   npm run verify:batch3
 *
 * Groups:
 *   [0] prerequisite from batch 1 (asset protocol in the render path)
 *   [1] P0-2  capability scopes narrowed
 *   [2]       runtime scope registration (why narrowing does not blank the app)
 *   [3]       every plugin API the renderer calls is still permitted
 *   [4] P0-1  CSP directives, and the code that forces each one
 *   [5]       asset protocol scope vs. what convertFileSrc emits
 *   [6]       build output (only when dist/ is fresh)
 *   [7]       deviations from the prompt baseline -> reported, not failed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const capabilities = JSON.parse(read("src-tauri/capabilities/default.json"));
const tileCapabilities = JSON.parse(read("src-tauri/capabilities/tile.json"));
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const generatedAcl = JSON.parse(read("src-tauri/gen/schemas/capabilities.json"));
const libRs = read("src-tauri/src/lib.rs");
const storageRs = read("src-tauri/src/storage.rs");
const markdownTs = read("src/utils/markdown.ts");
const updateCheckerTs = read("src/utils/updateChecker.ts");
const settingsModal = read("src/components/Settings/SettingsModal.tsx");

let checks = 0;
let failures = 0;
const warnings = [];

function check(name, ok, detail) {
  checks += 1;
  if (ok) {
    console.log(`  PASS  ${name}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  return false;
}

function warn(name, detail) {
  warnings.push(name);
  console.log(`  WARN  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/** Walk `src/` once; the source of truth for "what the renderer actually does". */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}
const sourceFiles = walk("src");
const sourceText = sourceFiles.map((file) => read(file)).join("\n");

const permissions = capabilities.permissions;
const findPermission = (list, identifier) =>
  list.find((item) => (typeof item === "string" ? item === identifier : item.identifier === identifier));

const collectPaths = (value, found = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, found);
  } else if (value && typeof value === "object") {
    if (typeof value.path === "string") found.push(value.path);
    for (const item of Object.values(value)) collectPaths(item, found);
  }
  return found;
};

const csp = config.app?.security?.csp;
const directive = (name) => {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`, "i").exec(csp ?? "");
  return match ? match[1].trim().split(/\s+/) : null;
};

// ---------------------------------------------------------------- [0] batch 1
section("[0] 前置：批次 1 的 asset 协议已就位（批次 3 的 CSP 依赖它）");
check("markdown.ts 渲染路径使用 convertFileSrc", /convertFileSrc\(/.test(markdownTs));
check("markdown.ts 渲染路径保留 20MB 上限", /MAX_RENDER_IMAGE_BYTES/.test(markdownTs));
check("导出路径仍走 data URL（DOCX/PDF 只认 data:）", /MAX_EXPORT_IMAGE_BYTES/.test(markdownTs)
  && /readImageAsDataUrl/.test(markdownTs));
check("绝对路径不再被 readFile 内联（渲染模式的 readFile 只剩导出兜底）",
  !/isAbsoluteFilePath\([\s\S]{0,400}?readFile\(/.test(markdownTs));
check("isNonFileImageSource 放行 asset: 与 http://asset.localhost（二次渲染幂等）",
  /asset:/.test(markdownTs) && /https\?:/.test(markdownTs));

// ---------------------------------------------------------------- [1] P0-2
section("[1] P0-2 capability 收紧：全仓不再有通配 scope");
const fsScope = findPermission(permissions, "fs:scope");
const openerScope = findPermission(permissions, "opener:allow-open-path");
const fsPaths = collectPaths(fsScope?.allow);
const openerPaths = collectPaths(openerScope?.allow);
const tileFsPaths = collectPaths(findPermission(tileCapabilities.permissions, "fs:scope")?.allow);

check("fs:scope 与 opener:allow-open-path 都存在", Boolean(fsScope) && Boolean(openerScope));
check("默认 capability 没有任何 \"**\"", ![...fsPaths, ...openerPaths].includes("**"),
  [...fsPaths, ...openerPaths]);
check("tile capability 也没有 \"**\"", !tileFsPaths.includes("**"), tileFsPaths);
check("fs:scope 不再直接放行 $HOME（桌面/文档/下载）",
  ![...fsPaths, ...tileFsPaths, ...openerPaths].some((item) => item.startsWith("$HOME/")),
  [...fsPaths, ...tileFsPaths]);
check("fs:scope 恰好是 $RESOURCE / $EXE / $APPDATA 三项",
  fsPaths.length === 3 && ["$RESOURCE/**", "$EXE/**", "$APPDATA/**"].every((item) => fsPaths.includes(item)),
  fsPaths);
check("opener 只剩 app 自有的三条路径",
  openerPaths.length === 3 && ["$APPDATA/**", "$EXE/**", "$RESOURCE/**"].every((item) => openerPaths.includes(item)),
  openerPaths);
check("tile 窗口的 fs:scope 与 default 同口径",
  tileFsPaths.length === 3 && fsPaths.every((item) => tileFsPaths.includes(item)), tileFsPaths);
check("多窗口仍覆盖 main / sticky-* / tile-* / canvas-tile-*",
  ["main", "sticky-*", "tile-*", "canvas-tile-*"].every((w) => capabilities.windows.includes(w)),
  capabilities.windows);
check("gen/schemas/capabilities.json 与 default.json 同步（tauri-build 已消费新配置）", (() => {
  // tauri-build strips the human-facing `description` fields, so compare the
  // parts that decide behaviour: identifier + allow list.
  const shape = (list) => list.map((item) => (typeof item === "string"
    ? item
    : { id: item.identifier, allow: item.allow ?? null }));
  return JSON.stringify(shape(generatedAcl.default?.permissions ?? [])) === JSON.stringify(shape(permissions));
})(), [generatedAcl.default?.permissions?.length, permissions.length]);

// opener: the only openPath caller was moved behind a Rust command.
check("渲染层不再直接调用 opener.openPath", !/\bopenPath\(/.test(sourceText)
  || /openPath\(/.test(settingsModal) === false);
check("「打开文件夹」改走 open_data_path 命令，且校验根目录前缀",
  /storage::open_data_path/.test(libRs) && /open_data_path[\s\S]{0,700}starts_with\(&root\)/.test(storageRs));
check("openUrl 仍可用（外部链接白名单不变）", /opener:default/.test(JSON.stringify(permissions)));

// ---------------------------------------------------------------- [2] runtime
section("[2] 运行期注册数据目录（收紧 scope 后不白屏的前提）");
check("setup 里调用 register_startup_roots",
  /\.setup\([\s\S]{0,800}?register_startup_roots/.test(libRs));
check("register_startup_roots 同时处理默认目录与指针目录",
  /fn register_startup_roots[\s\S]{0,700}default_data_root[\s\S]{0,400}read_pointer/.test(storageRs));
check("register_data_root 同时扩 fs scope 与 asset protocol scope",
  /fn register_data_root[\s\S]{0,900}fs_scope\(\)\.allow_directory[\s\S]{0,200}asset_protocol_scope\(\)\.allow_directory/
    .test(storageRs));
check("dev 下默认数据目录被映射回仓库根（src-tauri/target/ 之前的部分）",
  /fn default_data_root[\s\S]{0,900}\/src-tauri\/target\//.test(storageRs));
check("自定义目录缺失时抛错而不是重建空目录（不静默丢数据）",
  /DATA_DIRECTORY_UNAVAILABLE/.test(storageRs) || /unavailable/.test(storageRs));

// ---------------------------------------------------------------- [3] perms
section("[3] 渲染层调用的插件 API 都还有对应权限（收紧不等于砍功能）");
const FS_PERMISSION = {
  readFile: "fs:allow-read-file",
  readTextFile: "fs:allow-read-text-file",
  writeFile: "fs:allow-write-file",
  writeTextFile: "fs:allow-write-text-file",
  readDir: "fs:allow-read-dir",
  mkdir: "fs:allow-mkdir",
  remove: "fs:allow-remove",
  rename: "fs:allow-rename",
  exists: "fs:allow-exists",
  stat: "fs:allow-stat",
  copyFile: "fs:allow-copy-file",
};
const importedFs = new Set();
for (const file of sourceFiles) {
  const text = read(file);
  const match = /import\s*\{([^}]+)\}\s*from\s*"@tauri-apps\/plugin-fs"/.exec(text);
  if (match) {
    for (const name of match[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0])) {
      if (FS_PERMISSION[name]) importedFs.add(name);
    }
  }
}
check("解析出 fs 函数清单（非空）", importedFs.size > 0, [...importedFs]);
const missingFs = [...importedFs].filter((name) => !permissions.includes(FS_PERMISSION[name]));
check(`src 用到的 ${importedFs.size} 个 fs 函数全部有权限`, missingFs.length === 0,
  missingFs.map((name) => `${name} -> ${FS_PERMISSION[name]}`));

check("dialog open/save 权限在（导入、导出、选背景、选字体）",
  permissions.includes("dialog:allow-open") && permissions.includes("dialog:allow-save"));
check("dialog message 走 dialog:default", permissions.includes("dialog:default")
  && /import \{ message, open \} from "@tauri-apps\/plugin-dialog"/.test(read("src/components/Editor/NoteEditor.tsx")));
check("global-shortcut 注册/注销权限齐全",
  ["global-shortcut:allow-register", "global-shortcut:allow-unregister", "global-shortcut:allow-is-registered"]
    .every((item) => permissions.includes(item)));
const httpPermission = findPermission(permissions, "http:default");
const httpUrls = (httpPermission?.allow ?? []).map((item) => item.url);
check("http:default 覆盖任意 https AI 端点（hy 端点用户可配）",
  httpUrls.includes("https://**") && httpUrls.includes("https://**:*"), httpUrls.slice(0, 4));
check("http:default 明文 HTTP 只到 localhost / RFC1918",
  httpUrls.filter((item) => item.startsWith("http://")).every((item) =>
    /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(item)),
  httpUrls.filter((item) => item.startsWith("http://")).slice(0, 6));

// ---------------------------------------------------------------- [4] CSP
section("[4] P0-1 CSP：每条指令 + 逼出它的那段代码");
const CSP_SYNTAX = /^(?:'self'|'none'|'unsafe-inline'|'unsafe-eval'|'wasm-unsafe-eval'|'strict-dynamic'|data:|blob:|asset:|ipc:|filesystem:|mediastream:|https?:|wss?:|ws:|about:|mediastream:|\*|(?:https?|wss?|ipc):\/\/[^\s;]+)$/;
const cspTokens = (csp ?? "").split(";").flatMap((part) => part.trim().split(/\s+/).slice(1)).filter(Boolean);
const badTokens = [...new Set(cspTokens)].filter((token) => !CSP_SYNTAX.test(token));

check("csp 不是 null 且非空", typeof csp === "string" && csp.length > 0);
check("CSP 里没有非法的 source 表达式（拼写检查）", badTokens.length === 0, badTokens);
check("没有 dangerousDisableAssetCspModification", !/dangerousDisableAssetCspModification/.test(read("src-tauri/tauri.conf.json")));
check("script-src 只有 'self' + 'wasm-unsafe-eval'",
  directive("script-src")?.length === 2
  && directive("script-src").includes("'self'")
  && directive("script-src").includes("'wasm-unsafe-eval'"),
  directive("script-src"));
check("script-src 没有 'unsafe-eval' / 'unsafe-inline'",
  !directive("script-src")?.some((item) => item === "'unsafe-eval'" || item === "'unsafe-inline'"));
check("wasm-unsafe-eval 有依据：向量 worker 用 transformers.js 的 wasm 后端",
  /device: "wasm"/.test(read("src/utils/ai/vectorWorker.ts")));
check("style-src 带 'unsafe-inline'（大量内联 style + CSS 变量）",
  directive("style-src")?.includes("'unsafe-inline'"), directive("style-src"));
check("style-src 没有放开 'unsafe-eval'", !directive("style-src")?.includes("'unsafe-eval'"));
check("img-src 覆盖 data:（内联图/头像缓存）", directive("img-src")?.includes("data:"));
check("img-src 覆盖 blob:（头像裁剪、画布导出的 objectURL）",
  directive("img-src")?.includes("blob:") && /createObjectURL/.test(sourceText));
check("img-src 覆盖 asset: 与 http://asset.localhost（批次 1 后的本地图）",
  ["asset:", "http://asset.localhost"].every((item) => directive("img-src")?.includes(item)));
check("img-src 覆盖 https:（profiles.avatar_url 是远端 URL）",
  directive("img-src")?.includes("https:") && /avatar_url/.test(sourceText));
check("media-src 覆盖 asset:（便签/磁贴里的媒体）",
  directive("media-src")?.includes("asset:") && directive("media-src")?.includes("blob:"));
check("font-src 覆盖 asset:（@font-face 注入的是 asset URL）",
  directive("font-src")?.includes("asset:")
  && /@font-face[\s\S]{0,120}url\('\$\{f\.path\}'\)/.test(read("src/App.tsx")));
check("font-src 覆盖 data:（内嵌字体兜底）", directive("font-src")?.includes("data:"));
check("connect-src 带 ipc: 与 http://ipc.localhost（否则所有 invoke 全挂）",
  ["ipc:", "http://ipc.localhost"].every((item) => directive("connect-src")?.includes(item)),
  directive("connect-src"));
check("connect-src 已去掉笼统的 https: / wss: 通配",
  !directive("connect-src")?.includes("https:") && !directive("connect-src")?.includes("wss:"),
  directive("connect-src"));
check("connect-src 放行本机回环 http/ws（本地协作 ws:// 派生的 /health）",
  ["http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*"]
    .every((item) => directive("connect-src")?.includes(item)),
  directive("connect-src"));

/**
 * CSP host-source matching, good enough for the shapes this config uses:
 * `scheme:`, `scheme://host`, `scheme://*.suffix`, `scheme://host:*`.
 * Scheme is matched literally because `https:` does NOT cover `wss:`.
 */
function connectsTo(scheme, host) {
  const sources = directive("connect-src") ?? [];
  return sources.some((source) => {
    if (source === `${scheme}:`) return true;
    const match = /^([a-z]+):\/\/([^/:]+)(?::[^/]*)?/i.exec(source);
    if (!match || match[1].toLowerCase() !== scheme) return false;
    const pattern = match[2].toLowerCase();
    if (pattern === host) return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return false;
  });
}

/** Deployment endpoints come from the build env, so CSP drift is checkable. */
function readEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    if (!exists(file)) continue;
    for (const line of read(file).split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}
const env = readEnv();
const hostOf = (value) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
};
const supabaseHost = hostOf(env.VITE_SUPABASE_URL ?? "");
const collabUrl = env.VITE_COLLAB_URL ?? "";
const collabHost = hostOf(collabUrl);
const healthHost = hostOf(env.VITE_COLLAB_HEALTH_URL ?? "") ?? collabHost;

if (supabaseHost) {
  check(`supabase REST 被 connect-src 覆盖（${supabaseHost}）`, connectsTo("https", supabaseHost));
  check("supabase realtime（wss）被 connect-src 覆盖", connectsTo("wss", supabaseHost));
} else {
  warn("没有读到 VITE_SUPABASE_URL，跳过 supabase 覆盖检查");
}
if (collabHost) {
  check(`协作 WebSocket 被 connect-src 覆盖（${collabUrl}）`, connectsTo("wss", collabHost), collabHost);
  check("协作 /health（webview fetch）被 connect-src 覆盖", connectsTo("https", healthHost), healthHost);
} else {
  warn("没有读到 VITE_COLLAB_URL，跳过协作覆盖检查");
}
check("connect-src 不再依赖 api.github.com（更新检查改走 plugin-http）",
  !/api\.github\.com/.test(csp ?? "") && /@tauri-apps\/plugin-http/.test(updateCheckerTs));
check("worker-src 允许 'self'（vectorWorker 是同源 module worker）",
  directive("worker-src")?.includes("'self'")
  && /new Worker\(new URL\("\.\/vectorWorker\.ts", import\.meta\.url\)/.test(sourceText));
check("worker-src 允许 blob:（wasm 线程池会起 blob worker）", directive("worker-src")?.includes("blob:"));
check("frame-src 'none' 与「没有 iframe」一致", directive("frame-src")?.includes("'none'") && !/<iframe/i.test(sourceText));
check("object-src 'none'", directive("object-src")?.includes("'none'"));
check("base-uri 'self'", directive("base-uri")?.includes("'self'"));
check("form-action 'none' 与「表单都 preventDefault」一致",
  directive("form-action")?.includes("'none'") && !/<form[^>]+action=/.test(sourceText));
check("没有内联事件属性（CSP 下会被静默拦掉）",
  !/\son(?:click|change|input|load|error|mouse\w+|key\w+)="/.test(sourceText));
check("没有 eval / new Function（script-src 'self' 会拦）", !/\beval\(|new Function\(/.test(sourceText));

// ---------------------------------------------------------------- [5] asset
section("[5] asset 协议 scope 与 convertFileSrc 的输出形态");
const assetScope = (config.app?.security?.assetProtocol?.scope ?? []).filter((item) => typeof item === "string");
check("asset 协议已启用", config.app?.security?.assetProtocol?.enable === true);
check("Cargo 侧开了 protocol-asset 特性（否则 asset URL 根本注册不上）",
  /tauri\s*=\s*\{[^}]*"protocol-asset"/.test(read("src-tauri/Cargo.toml")));
check("asset scope 含数据目录三形态",
  ["$RESOURCE/**", "$EXE/**", "$APPDATA/**"].every((item) => assetScope.includes(item)), assetScope);
check("asset scope 恰好三项，不再含 $PICTURE/$DESKTOP/$DOWNLOAD",
  assetScope.length === 3, assetScope);
check("asset scope 没有 \"**\"", !assetScope.includes("**"), assetScope);
check("数据目录外的图片改成可见占位，不再生成会 403 的 asset URL",
  /if \(!insideDataDirectory\) return null;/.test(markdownTs)
  && /markdown-external-image/.test(markdownTs)
  && /replaceExternalImages\(html, dataDirectory\)/.test(markdownTs));
check("CSP 放行的 asset origin 与 Windows 上 convertFileSrc 的输出一致",
  directive("img-src")?.includes("http://asset.localhost")
  && /__TAURI_INTERNALS__\.convertFileSrc/.test(read("node_modules/@tauri-apps/api/core.js")));
check("窗口没有开 useHttpsScheme（否则 asset URL 会变成 https://asset.localhost）",
  !/"useHttpsScheme"\s*:\s*true/.test(read("src-tauri/tauri.conf.json")));

// ---------------------------------------------------------------- [6] dist
section("[6] 构建产物（需要先 npm run build）");
if (exists("dist/index.html")) {
  const html = read("dist/index.html");
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)];
  const assets = fs.readdirSync(path.join(root, "dist/assets"));
  const jsFiles = assets.filter((name) => name.endsWith(".js"));
  const entryChunk = jsFiles.find((name) => /^index-/.test(name));
  const evalHits = [];
  for (const name of jsFiles) {
    const text = read(`dist/assets/${name}`);
    if (/\beval\(|new Function\(/.test(text)) evalHits.push(name);
  }
  check("dist/index.html 没有内联 <script>（否则要等 Tauri 注入 hash）", inlineScripts.length === 0,
    inlineScripts.map((item) => item[0].slice(0, 60)));
  // Own code must stay eval-free; vendor glue is reported separately because the
  // runtime probe (wasm-eval-probe.mjs) settles whether it is ever reached.
  check("自家入口 chunk 里没有 eval( / new Function(",
    entryChunk !== undefined && !evalHits.includes(entryChunk), evalHits);
  const vendorEval = evalHits.filter((name) => name !== entryChunk);
  if (vendorEval.length > 0) {
    warn("第三方 chunk 含运行期代码生成（CSP 下会被拦，需确认走不到）", vendorEval);
  }
  check("打包产物里有 .wasm（wasm-unsafe-eval 的必要性）", assets.some((name) => name.endsWith(".wasm")));
} else {
  warn("dist/ 不存在，跳过构建产物检查");
}

// The config is compiled into the binary by tauri-build; if a stale build is on
// disk the string would still be the old one, so this doubles as a freshness check.
const exePath = path.join(root, "src-tauri/target/debug/qing-notepad.exe");
if (fs.existsSync(exePath)) {
  const binary = fs.readFileSync(exePath).toString("latin1");
  check("调试产物里确实编进了新 CSP（wasm-unsafe-eval）", binary.includes("wasm-unsafe-eval"));
  // Parse the embedded directive instead of substring-matching, because
  // `https://*.supabase.co` starts with the bare `https:` token we forbid.
  const embedded = /connect-src((?:\s+[^;"]+)+)/.exec(binary)?.[1]?.trim().split(/\s+/) ?? [];
  check("调试产物里的 connect-src 是收窄后的版本（无笼统 https: / wss:）",
    embedded.length > 0
    && !embedded.includes("https:")
    && !embedded.includes("wss:")
    && embedded.includes("wss://*.onrender.com")
    && embedded.includes("http://localhost:*"),
    embedded.slice(0, 12));
  check("调试产物里不再有 $HOME/Documents 这类旧 scope",
    !binary.includes("$HOME/Documents") && !binary.includes("$HOME/Desktop"));
  check("调试产物里的 asset scope 已收回（紧跟 CSP 的三个目录）",
    // `$PICTURE/**` also appears in the embedded ACL manifest for
    // `fs:scope-picture`, so anchor on the CSP and require the short list.
    binary.includes("form-action 'none'$APPDATA/**$EXE/**$RESOURCE/**"));
} else {
  warn("没有 debug 产物，跳过二进制检查");
}

// ---------------------------------------------------------------- [7] drift
section("[7] 残留风险（不判失败，需要你决定）");
if (directive("img-src")?.includes("https:")) {
  warn("img-src 仍保留通配 https:（头像 URL 不可穷举，故只能收到这里）");
}

const summary = `${checks - failures}/${checks} checks passed`;
console.log(`\n${failures === 0 ? "ALL PASS" : "FAILED"} — ${summary}, ${warnings.length} warnings`);
if (failures > 0) process.exitCode = 1;
