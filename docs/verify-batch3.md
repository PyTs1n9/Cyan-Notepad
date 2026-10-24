# 批次 3 验证报告（CSP + capability 收紧）

日期：2026-10-24　范围：`docs/prompts-fix-performance-security.md` 批次 3（P0-2 / P0-1）
方式：静态 + 构建期 + 局部运行时探针。**本机无 GUI，界面行为一律未验证**，集中列在第 3 节。

## 1. 结论速览

| 批次 | 内容 | 代码状态 | 自动验证 |
| --- | --- | --- | --- |
| 1 | P1-6 noteId 白名单、P0-3 图片改 asset 协议 | 已落地 | 11 条（混在 batch2 与 batch3 脚本里）全绿 |
| 2 | P0-4 索引止血、P1-1 取消全量扫描、P1-2 差集补录 | 已落地 | 41/41 全绿 |
| **3** | **P0-2 fs scope / opener、P0-1 CSP** | **已落地（A1+A2+B 三步）** | **75/75 全绿 + 负向对照 + wasm 探针** |
| 4 | P1-5 协作服务器限流 | **已落地，见 `docs/verify-batch4.md`** | 23/23 行为断言全绿 |

复跑命令：

```bash
npm run verify:batch3          # 67 条配置/构建产物断言
npm run verify:batch3:probe    # ONNX glue 是否触发 new Function
npm run verify:batch2          # 41 条，含批次 1 遗留项
```

## 2. 自动验证明细

### 2.1 构建期（最权威）

- `node node_modules/typescript/bin/tsc --noEmit` → 0 错误。
- `npm run build` → `built in 9.09s`（PowerShell；尾部 `NativeCommandError` 是 stderr 的 chunk 体积警告被包装，不是失败）。
- `cargo check`（`CARGO_TARGET_DIR=src-tauri/target/check-verify`，增量 2.9s）→ `Finished`。
  `tauri-build` 会解析 `tauri.conf.json` + 两个 capability，这一步通过即说明 ACL 与 CSP 字段合法。
- **负向对照**：注入 `"fs:allow-bogus-xyz"` → `Permission fs:allow-bogus-xyz not found` + 构建失败；
  恢复后 sha256 与注入前一致，构建重新绿。**这条证明上面的“通过”不是因为校验没跑**。
- `gen/schemas/capabilities.json` 与 `default.json` 行为字段逐项一致 → 生成物确实来自当前配置。
- debug 产物 `target/debug/qing-notepad.exe` 内含 `wasm-unsafe-eval`，且不再含 `$HOME/Desktop|Documents`。

### 2.2 P0-2 capability（14 条）

`fs:scope` = `$RESOURCE/**` + `$EXE/**` + `$APPDATA/**`，恰好三条；`opener:allow-open-path` 同三目录；
`default.json` 与 `tile.json` 均无 `"**"`、无 `$HOME/*`；`windows` 仍覆盖 `main / sticky-* / tile-* / canvas-tile-*`；
渲染层已无裸 `openPath` 调用，「打开文件夹」走 `open_data_path` 命令并在 Rust 侧做 `starts_with(root)` 校验。

收紧不白屏的支撑：`lib.rs` 的 setup 调 `register_startup_roots` → `register_data_root` 同时
`fs_scope().allow_directory` 与 `asset_protocol_scope().allow_directory`（脏目录与自定义目录都覆盖）；
dev 下 `default_data_root` 把 `src-tauri/target/` 之前的部分映射回仓库根。

`tile` 窗口只有静态 scope，但 `fs` 命令收的是 `GlobalScope + CommandScope`，运行期注册进 GlobalScope
的目录对所有窗口生效 —— 所以自定义数据目录下磁贴窗口仍可读。

### 2.3 权限覆盖（7 条）

从 `src/` 实际 import 的 `@tauri-apps/plugin-fs` 成员反查：10 个函数（readFile / readTextFile / writeFile /
writeTextFile / readDir / mkdir / remove / rename / exists / stat）全部有对应 `fs:allow-*`；
`dialog:allow-open` / `dialog:allow-save` / `dialog:default`（message）/ global-shortcut 四项齐全；
`http:default` 覆盖 `https://**` 与 `https://**:*`，明文 HTTP 仅 localhost / 127.0.0.1 / RFC1918。

### 2.4 P0-1 CSP（26 条）

逐指令核对，每条都能对应到真实调用点：

| 指令 | 值 | 逼出它的代码 |
| --- | --- | --- |
| `script-src` | `'self' 'wasm-unsafe-eval'` | `vectorWorker.ts` 用 transformers.js 的 `device: "wasm"` |
| `style-src` | `'self' 'unsafe-inline'` | 全量内联 style + CSS 变量 |
| `img-src` | `data: blob: asset: http://asset.localhost https:` | 内联图/头像、`createObjectURL`（裁剪/画布导出）、批次 1 的 asset URL、`profiles.avatar_url` |
| `font-src` | `data: asset: http://asset.localhost` | `@font-face { src: url('${f.path}') }` |
| `connect-src` | `ipc: http://ipc.localhost https: wss: ws://localhost:* ws://127.0.0.1:*` | IPC 通道、协作 wss、健康检查 webview fetch |
| `worker-src` | `'self' blob:` | 同源 module worker + wasm 线程池 |
| `frame-src` / `object-src` | `'none'` | 全仓无 `<iframe>`、无 `<object>` |
| `form-action` | `'none'` | 所有 `<form>` 都是 `onSubmit` + `preventDefault`，无 `action` 属性 |

另外：CSP token 逐个通过语法校验；`script-src` 无 `'unsafe-eval'` / `'unsafe-inline'`；
未设 `dangerousDisableAssetCspModification`；更新检查已改 `plugin-http`，CSP 里不再需要 `api.github.com`；
全仓无内联事件属性、无 `eval(`/`new Function(`（源码层）。

### 2.5 asset 协议（6 条）

`Cargo.toml` 开了 `protocol-asset`；`assetProtocol.scope` 含数据目录三形态、无 `"**"`；窗口未开 `useHttpsScheme`。
平台事实有源码依据：Windows 上 `resource_dir()` 直接返回 exe 目录（tauri-utils `platform.rs:272-310`
对 `cfg!(target_os="windows")` 短路），故 `$RESOURCE` == `$EXE`；`convertFileSrc` 在 Windows 输出
`http://asset.localhost/<enc>`（`tauri/src/webview/mod.rs:2697`），与 CSP 中写的 origin 逐字一致。

### 2.6 运行时探针（1 条）

`vectorWorker` 产物里有 onnxruntime 的 embind `craftInvokerFunction`（内部 `new Function`），
`script-src 'self'` 会拦。`wasm-eval-probe.mjs` 实例化 `ort-wasm-simd-threaded.asyncify.wasm` 并调
`_OrtInit`，`new Function` 调用次数 **0**。结论：初始化路径不会被 CSP 打掉；
inference session 创建路径未覆盖，仍列真机清单。

另外 `exportDocx` chunk 的 `new Function` 在 `setImmediate` polyfill 里，仅在传入字符串时触发，实际调用传函数，走不到。

### 2.7 dialog 自动扩 scope 的前提

`tauri-plugin-dialog-2.8.3/src/commands.rs:194-255`：选中文件/目录后调
`window.try_fs_scope().allow_file / allow_directory`。所以收紧 `fs:scope` **不会**挡导入导出。
注意它只扩 fs scope，**不扩 asset scope**。

## 3. 必须真机验证（无法自动化的部分）

| 项 | 为什么自动化不了 |
| --- | --- |
| 启动是否白屏、CSP 是否被 WebView2 报错 | 需要真实 webview；本机无 GUI |
| 导入 `.md` / 导出 DOCX / 导出 PDF / 导入字体 / 选背景图 五条 dialog 路径 | 需要真实文件选择器交互 |
| 笔记图片三种源（attachment / 相对 / 绝对）是否显示 | WebView2 的 asset 协议 403 行为只能运行时看 |
| 自定义字体是否生效、协作空间能否连（wss）、检查更新能否返回 | 依赖真实网络与渲染 |
| 托盘、便签、磁贴窗口、AI 对话与本地向量索引首次建索引 | 多窗口与 wasm 运行期 |
| 自定义数据目录（设置→存储 迁移后）下编辑/贴纸窗口读写 | 需要真实 IPC |

## 4. connect-src 精确化（原 WARN 1 / WARN 3，已修复）

`https:` 与 `wss:` 两个 scheme 通配已删除，换成实际部署主机 + 本机回环：

```
connect-src 'self' ipc: http://ipc.localhost
             https://*.supabase.co wss://*.supabase.co
             https://*.onrender.com wss://*.onrender.com
             http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*
```

- 依据：`VITE_SUPABASE_URL=https://skwkzymlhqwgygwwlxoy.supabase.co`（REST + realtime 同 host），
  `VITE_COLLAB_URL=wss://cyan-notepad-collab.onrender.com`（WebSocket + 派生的 `/health`)。
- WARN 1 同时被修：`http://localhost:* / http://127.0.0.1:*` 补上，本地 `ws://127.0.0.1:1234`
  派生出的 `/health` 不再被挡。
- 新增守护（`audit.mjs` §4）：读 `.env.local` / `.env` 的 `VITE_SUPABASE_URL`、`VITE_COLLAB_URL`、
  `VITE_COLLAB_HEALTH_URL`，按 CSP host-source 规则断言每个 host 都被 `connect-src` 覆盖。
  **换域名忘了改 CSP → `npm run verify:batch3` 直接 FAIL**，不再靠人记。
- 代价（明确接受）：CSP 与部署域名耦合。自建到 `*.onrender.com` / `*.supabase.co` 之外的主机时，
  必须同步改 `connect-src`（`.env.example` 已写明）。
- 残留：`img-src` 的 `https:` 保留——`profiles.avatar_url` 可能是 OAuth 头像（github/google 域不可穷举），
  头像若要彻底收窄，得改走 Rust 下载后落 `data/` 缓存，属另一件事。

## 5. asset scope 收回（原 WARN 2，已修复）

`assetProtocol.scope` 回到 `$APPDATA/$EXE/$RESOURCE` 三条，`$PICTURE/$DESKTOP/$DOWNLOAD` 已删。

**为什么敢收**：三条插入路径（dialog 选图、剪贴板粘贴、拖拽文件）本来就都走
`saveImageAttachment()` → 写进 `data/img` → markdown 只存 `attachment://<file>`。外部绝对路径只可能来自
手写或导入的 `.md`，应用自身从不产生。

**改动（`src/utils/markdown.ts`）**：

1. `renderUrlForLocalImage()` 对数据目录外的路径直接 `return null`，不再 `convertFileSrc` —— 否则拿到的是
   一个必然 403 的 asset URL。
2. `markdownRenderer.image` 对「未解析成功且是本地绝对路径」的图片输出
   `<span class="markdown-external-image" title="原路径">`，而不是退化成裸 alt 文本。
   此前 `C:/Windows/a.png` 会被协议白名单挡掉、整张图**无声消失**，现在是有边框的占位 chip。
3. `replaceExternalImages()` 兜住 stored HTML（TipTap 产物 / 导入的 HTML）里的越界 `<img>`；只做绝对路径，
   对 `http://asset.localhost/x.png` 这类相对片段保持幂等。
4. 导出路径（`export` 模式）完全不变：DOCX/PDF 仍走 data URL + 数据目录限制 + 8MB 上限。

**降级语义**：数据目录外的图片显示为占位 chip（tooltip 里是原路径），用户在原位置重新插入图片即完成导入
（`saveImageAttachment` 会复制进 `data/img` 并把引用改写成 `attachment://`）。

**副作用（明确接受）**：迁移数据目录后，历史笔记里的外部绝对路径图不会跟着走 —— 收之前它们指向原本机路径，
本来也迁不走。附带好处是「图片一定在 `data/` 里」这条不变量现在真的成立了。

**自查脚本**：`node scripts/verify-batch3/count-image-refs.mjs <data/notes>` 统计现有笔记的图片引用形态，
升级前先跑一遍就知道有多少张会变成占位。

## 6. 后续批次建议

- **批次 4**：可以开始。纯服务端、无 GUI 依赖，`tsc` + collab-server 自身 `tsc` 即可覆盖大半。按提示词
  做即可，注意 `onTokenSync` 命中缓存后仍要断言 `user.id === context.userId`。
- **批次 3 的真机回归不要省**：上面第 3 节 6 组是这一批唯一的验收缺口；建议按「启动 → 五条 dialog →
  三种图片源 → 字体/协作/更新 → 托盘便签磁贴 → AI 与向量索引」顺序走一遍，任一条挂掉先怀疑 CSP
  而不是回退 `"**"`。
- **真机通过后**再考虑 P1-3（拆 store）：它和本批的失败面高度相似（都能表现成「界面不对」），
  不要叠加。
- 长期：把 `npm run verify:batch3` 挂进 CI，配置类回归（谁再写回 `"**"`、谁把 `ipc:` 删了）能当场拦住。
