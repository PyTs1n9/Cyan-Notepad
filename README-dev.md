# Qing Notepad - 开发者文档

本文档面向开发者和 AI coding agent，描述当前项目结构、开发命令、数据模型、发布流程和常见维护约束。产品功能和下载说明请阅读 [README.md](./README.md)。

会话工作流约定见 [AGENTS.md](./AGENTS.md)：每次非平凡改动先 `grill` 澄清、涉及技术选型再 `architect`，结论沉淀到 `docs/decisions-*.md`。

---

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri v2 |
| 前端框架 | React 19 + TypeScript 5.8 |
| 构建工具 | Vite 7 |
| 状态管理 | Zustand 5 |
| 样式 | Tailwind CSS v4（`@tailwindcss/vite`）+ CSS 变量主题 |
| Markdown 编辑器 | CodeMirror 6（源码）+ `marked`（预览），`turndown` 兼容历史 HTML |
| 本地 AI 推理 | `@huggingface/transformers`（ORT WASM/WebGPU，随包分发） |
| 实时协作 | `yjs` + `@hocuspocus/provider` + `y-indexeddb` + `y-codemirror.next` |
| 在线工作台 | `@supabase/supabase-js`；协作服务为独立 `collab-server/`（hocuspocus） |
| 富文本/粘贴 | `@tiptap/*`（粘贴与富内容处理） |
| 导出 | `docx`（Word）、`highlight.js`（代码高亮） |
| 图标 | `lucide-react` + `src/assets/logos/*`（AI 厂商品牌 SVG） |
| 本地存储 | `@tauri-apps/plugin-fs` |
| 文件对话框 | `@tauri-apps/plugin-dialog` |
| 外链 / 打开路径 | `@tauri-apps/plugin-opener` |
| 全局快捷键 | `@tauri-apps/plugin-global-shortcut` |
| 深度链接 | `@tauri-apps/plugin-deep-link` |
| HTTP（AI 端点） | `@tauri-apps/plugin-http` |

当前目标版本号为 **0.7.0**。版本号由以下位置共用，统一通过命令更新：

- `package.json`（同时被 `src/utils/updateChecker.ts` 的 `APP_VERSION` 读取，即关于页显示的版本）
- `package-lock.json`
- `src-tauri/tauri.conf.json`（Tauri 打包版本）
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`

请使用以下命令统一更新这些文件，避免手动修改遗漏：

```bash
npm run version:set -- v0.7.0
```

命令接受带或不带 `v` 前缀的语义化版本号，例如 `0.7.1` 或 `v0.7.1`。发布说明（即 GitHub 构建时附在 Release 上的 md 文档）在 `.github/workflows/release.yml` 的 `releaseBody` 中按本次发布单独维护，与版本号一同在打 `v*` tag 时生效。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 仅启动 Vite renderer，固定端口 `8787` |
| `npm run tauri dev` | 启动完整 Tauri 桌面开发模式 |
| `npx tsc --noEmit` | TypeScript 类型检查 |
| `npm run build` | 执行 `tsc && vite build`，构建前端产物 |
| `npm run tauri build` | 构建 Windows 桌面安装包 |
| `npm run version:set -- vX.Y.Z` | 同步上述五处版本号 |
| `npm run collab:dev` | 仅本地启动协作服务（`collab-server/`） |
| `npm run verify:ui-polish` | 视觉与对比度静态审计（改动 UI 后建议运行） |

`npm run tauri ...` 实际执行 `scripts/tauri-with-cleanup.mjs`。该脚本会调用本地 `@tauri-apps/cli`，并在 `dev` 前后清理 `src-tauri/target/debug/build` 和 `.fingerprint` 中过多的历史调试构建目录，默认最多保留 3 组。

在 Windows PowerShell 中，`npx tsc --noEmit` 可能因本机脚本执行策略拦截 `npx.ps1`。如果只是被执行策略拦截，而不是 TypeScript 报错，记录在最终说明里即可。

---

## Windows 环境

Tauri / Rust 构建需要 MSVC 链接器。项目提供了 `env.ps1`，每次运行 Tauri 命令前建议在 PowerShell 中加载：

```powershell
. .\env.ps1
npm run tauri dev
```

`env.ps1` 中的 MSVC 和 Windows SDK 版本号必须匹配本机安装路径（从 `env.example.ps1` 复制后按本机修正）。变量缺失或版本不匹配时，链接阶段会报 `link.exe` 找不到或 MSVC 库路径错误。

CI 发布流程使用 `windows-latest`、Node.js 22、Rust stable 和 `tauri-apps/tauri-action@v1`，并通过 `Swatinem/rust-cache` 缓存 `src-tauri/target/`。

---

## 项目结构

```text
QingNotepad/
├── src/
│   ├── components/
│   │   ├── AI/                 # 右侧栏 AI 面板：AiSidebar / AiSettingsPanel / AiPolishPanel
│   │   │                       #   ModelPicker / ModelBrandIcon（多厂商端点与模型选择）
│   │   ├── Auth/               # AuthModal / PasswordRecoveryModal（Supabase 账户）
│   │   ├── Canvas/             # CanvasView / CanvasToolbarMenu / CanvasTextToolbar（自由画布）
│   │   ├── Editor/             # NoteEditor（源码/预览/分屏）、MarkdownSourceEditor、MarkdownViewSwitch
│   │   ├── Help/               # HelpMenu（顶栏唯一菜单）、HelpCenterModal、UpdateCheckModal
│   │   ├── Layout/             # ActivityBar / Sidebar / TitleBar / ShellStrip / NoteTabBar
│   │   │                       #   NoteTree / DropdownMenu / ModalShell / EmptyState
│   │   │                       #   SidebarResizeHandle / sidebarLayout.ts / shellLayout.ts
│   │   ├── Settings/           # SettingsModal / AboutModal / AvatarCropper
│   │   │                       #   StorageSection（数据目录迁移）/ UpdateModal
│   │   ├── Sticky/             # StickyNote（可编辑置顶便签窗口）
│   │   ├── Tile/               # TileView（只读磁贴窗口）
│   │   ├── Todo/               # TodoView / TodoSidebar / TodoStrip / TodoDescriptionCard
│   │   ├── Trash/              # TrashModal（回收站）
│   │   ├── Workspace/          # WorkspaceView / WorkspaceOverview（概览面板）/ WorkspaceSidebar
│   │   │                       #   WorkspaceStrip / WorkspaceDropdown / HoverPopover
│   │   │                       #   CloudNoteEditor / PublicationDateTimePicker
│   │   │                       #   WorkspaceRemovalNotifier / workspaceLabels.ts
│   │   ├── AppDialog.tsx       # 统一弹窗底座
│   │   ├── PanelErrorBoundary.tsx
│   │   ├── UserAvatar.tsx
│   │   └── LoadingText.tsx
│   ├── stores/                 # Zustand：todoStore / noteStore / fontStore / settingsStore
│   │                           #   aiStore / dialogStore / tabStore / workspaceStore
│   │                           #   workspaceUi / authStore
│   ├── types/                  # index.ts（共享类型）、turndown-plugin-gfm.d.ts
│   ├── utils/
│   │   ├── ai/                 # 本地与云端 AI：knowledgeRetrieval / vectorIndex
│   │   │                       #   polish / provider / modelBrand / smallTalk / structured / thinking
│   │   │                       #   chat/：endpoints（厂商预设）/ modelsApi / openaiCompat / index / types
│   │   ├── storage.ts          # Tauri fs 持久化封装 + 数据目录解析（与 Rust 侧镜像）
│   │   ├── theme.ts            # 主题 class 与 CSS 变量应用
│   │   ├── i18n.ts             # typed zh/en 翻译表
│   │   ├── markdown.ts         # Markdown 渲染与 HTML 转义（信任边界）
│   │   ├── shortcutManager.ts  # 全局快捷键注册
│   │   ├── stickyManager.ts    # sticky-* 窗口创建与追踪
│   │   ├── tile.ts             # tile-* / canvas-tile-* 窗口创建与主题同步
│   │   ├── externalLinks.ts    # 预览区外链处理
│   │   ├── portalActions.ts    # 全屏遮罩 portal（侧栏内）
│   │   ├── shortcutReference.ts
│   │   ├── todoIntent.ts       # 待办行内意图解析
│   │   ├── noteIndexFingerprint.ts
│   │   └── updateChecker.ts    # APP_VERSION（来自 package.json）+ GitHub 版本检查
│   ├── App.tsx                 # 初始化、持久化、主题、导入导出、布局、窗口同步
│   ├── main.tsx                # 根据 query 渲染 App / TileView / StickyNote
│   └── index.css               # Tailwind v4 token、主题变量、窗口样式
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # 插件、托盘、单实例、关闭到托盘、quit_app
│   │   ├── main.rs             # 调用 qing_notepad_lib::run()
│   │   ├── storage.rs          # 可迁移数据目录：指针文件、scope 注册、迁移
│   │   └── window_bg.rs        # 窗口背景（玻璃/模糊）
│   ├── capabilities/
│   │   └── default.json        # main / sticky-* / tile-* / canvas-tile-* 权限
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── tauri.conf.json
├── collab-server/              # 可选协作服务（hocuspocus），独立进程
├── scripts/                    # set-version.mjs / tauri-with-cleanup.mjs / verify-*.mjs / gen-*.mjs
├── supabase/                   # 在线工作台数据库迁移 SQL
├── docs/                       # decisions-* / plan-* / prompt-* / 用户手册与 FAQ
├── env.ps1 / env.example.ps1
├── package.json
└── vite.config.ts
```

---

## 入口与窗口

`src/main.tsx` 根据 URL query 选择渲染入口：

- 默认：`<App />`
- `/?tile=1&noteId=<id>`：`<TileView />`
- `/?sticky=<id>`：`<StickyNote />`
- 画布磁贴通过 `canvas-tile-*` 窗口标签承载

Tauri 权限在 `src-tauri/capabilities/default.json` 中声明，窗口 label 覆盖：

```json
["main", "sticky-*", "tile-*", "canvas-tile-*"]
```

新增窗口类型时，需要同步：

- `src/main.tsx` 的入口选择
- 创建窗口的 util
- capabilities 中的 window label 和权限

注意 `fs:scope` 与 `opener:allow-open-path` 的权限说明：数据目录在运行时由 `storage::register_startup_roots` 注册 scope，用户导入/导出文件由 `tauri-plugin-dialog` 把所选路径加入 scope，**不使用 `**` 通配**，避免被攻陷的 renderer 读取整盘。

---

## 状态模型

状态集中在 `src/stores/`（Zustand）。核心 store：

| Store | 职责 |
| --- | --- |
| `todoStore` | 待办与清单、状态/优先级筛选、CRUD、拖拽排序、完成沉底 |
| `noteStore` | 笔记元数据、活动笔记、搜索、标签/分类筛选、导入导出 |
| `fontStore` | 内置字体 + 导入的自定义字体 |
| `settingsStore` | 主题、语言、自定义配色、至多 5 套预设、快捷键、自动保存 |
| `aiStore` | AI 端点、活动模型、对话、流式状态、错误 |
| `dialogStore` | 全局弹窗（统一弹窗底座）编排 |
| `tabStore` | 打开的笔记标签页 |
| `workspaceStore` | 工作台、文档、成员、活动工作区 |
| `workspaceUi` | 工作台瞬时 UI 状态（侧栏开合等） |
| `authStore` | Supabase 登录态、用户、会话 |

`Todo` 与 `Note` 的关键字段与排序/分类规则见 README-Dev 旧版约定，仍适用：置顶项不可删除或拖拽，删除分类会把其下笔记移回未分类，笔记可在同分类内拖拽或拖到分类按钮上移动。

---

## 数据持久化（重要：路径已变更）

所有持久化集中在 `src/utils/storage.ts`，通过 Tauri fs 插件读写。数据目录的解析逻辑与 `src-tauri/src/storage.rs` 中的 `default_data_root` **镜像一致**：

- **开发构建**：数据放在**仓库根目录**下的 `data/`。
- **安装构建**：数据放在**可执行文件旁**的 `data/`（即 `resource_dir/data`）。
- **不再**默认写入 `%APPDATA%`。旧文档写的 `%APPDATA%/com.qing-notepad.app/data/` 已不准确。

`data/` 内部结构（与 README「数据存储」一节一致）：

```text
data/
├── todos.json              # 待办任务
├── todo-lists.json         # 待办清单和当前清单
├── fonts.json              # 导入字体注册表
├── settings.json           # 主题、语言、背景、快捷键、自动保存等设置
├── ui-state.json           # 当前打开的标签页
├── app-icon.png            # 自定义应用图标
├── img/                    # 笔记图片附件
├── img-canvas/             # 画布图片资源
├── img-need/               # 头像和应用背景历史
├── img-trash/              # 待清理的图片资源
├── notes/
│   ├── index.json          # 笔记元数据、文件夹与分类索引
│   └── <uuid>.md           # 笔记正文，兼容历史 HTML
├── trash/notes/            # 回收站中的笔记
├── canvas/
│   ├── index.json          # 画布列表
│   └── boards/*.json       # 画布内容
└── ai/
    ├── chats.json          # AI 对话记录
    ├── credentials.bin     # 经系统加密的 API Key
    ├── preferences.json    # 模型与搜索偏好
    └── snapshots/          # AI 改写前的笔记快照
```

### 可迁移数据目录

用户可在「设置 → 存储」把整个 `data/` 迁移到任意磁盘目录。机制（见 `storage.rs`）：

1. **指针文件** `storage.json` 存放在系统配置目录（`app_config_dir`，Windows 上约为 `%APPDATA%/com.qing-notepad.app/storage.json`），只记录数据根路径；资料本体始终留在用户指定的数据目录。
2. 启动时 `register_startup_roots` 把默认目录与指针指向的自定义目录**同时**注册进 fs scope 与 asset protocol scope，否则自定义目录会读为空、图片会 403。
3. 迁移 `storage_migrate`：
   - **同卷**：对每个顶层条目做一次 `rename`，瞬时完成。
   - **跨卷**：递归拷贝，逐条目**字节校验**通过后才删除源，拷贝未完成绝不删源。
   - **指针最后写**：只有全部移动成功才写指针，失败则应用继续用旧目录，不会指向半截资料库。
4. 目标非空且含真实笔记/AI 历史时拒绝迁移（`has_user_content` 检测）；仅含应用自生成的配置文件时才允许「恢复默认目录」式替换。

相关 Rust 命令：`storage_get_root`、`storage_set_root`、`storage_clear_root`、`storage_probe`、`storage_migrate`、`open_data_path`（校验后打开数据目录内文件夹）。前端 UI 在 `src/components/Settings/StorageSection.tsx`。

自动持久化位置：`App.tsx`（todos、note index、fonts、settings）、`NoteEditor`（笔记内容，`Ctrl+S` + 周期自动保存）、`StickyNote`（独立窗口保存后事件通知主窗口）。

---

## 编辑器流程

当前主编辑器是 Markdown 工作区，提供**源码 / 预览 / 分屏**三种视图：

- 源码视图基于 **CodeMirror 6**（`MarkdownSourceEditor.tsx`），预览基于 **`marked`**（`NoteEditor.tsx`）。
- 加载到历史 HTML 时通过 `turndown` 转成 Markdown；`turndown-plugin-gfm` 处理表格等 GitHub 风格语法。
- 源码与预览双向滚动同步；切换活动笔记前保存上一条。
- 用户输入的 HTML 在 `utils/markdown.ts` 中被转义，链接/图片走白名单（信任边界）。
- `@tiptap/*` 主要用于粘贴与富内容处理，不是主编辑路径。
- 外链点击由 `utils/externalLinks.ts` 处理，避免 WebView 内默认导航导致无法回退。

---

## AI 模块

AI 面板在右侧栏，模式在「小青（本地）」与云端模型（DeepSeek 等）之间切换。

### 本地「小青」

- `knowledgeRetrieval.ts`：关键词 + 语义向量**混合排序**检索，覆盖功能手册、常见问答、笔记、便签、待办与画布文本，回收站不参与检索。
- `vectorIndex.ts`：语义向量索引（本地推理依赖 `@huggingface/transformers`，ORT WASM/WebGPU 运行时随安装包分发）。
- **完全离线**：不联网、不消耗额度、不上传任何内容。

### 云端模型

- `chat/endpoints.ts`：已知厂商预设（`ENDPOINT_PRESETS`，如 DeepSeek）。
- `chat/modelsApi.ts`：向端点「搜索模型」拉取可用模型列表。
- `chat/openaiCompat.ts`：OpenAI 兼容的流式 chat completions 调用。
- `chat/provider.ts` + `chat/types.ts`：provider 与错误类型（missing-key / unauthorized / insufficient-balance / rate-limited / server / bad-response / aborted / network）。
- `polish.ts`：选中文字改写（润色 / 更简洁 / 更正式 / 更口语化 + 自定义要求）。
- `smallTalk.ts` / `structured.ts` / `thinking.ts`：对话式笔记改写、结构化输出、思考态。
- `modelBrand.ts` + `src/assets/logos/*`：多家厂商品牌图标（bytedance、claude、deepseek、doubao、gemini、google、meta、mistral、moonshot、ollama、openai、openrouter、qwen、siliconcloud、xiaomimimo、zhipu 等）。
- **注意**：本周期已**移除**旧版的实时网页搜索（Bocha）能力；云端模型问答仅以本地检索内容为上下文。
- 端点与 API Key 经 Windows 系统加密后仅存本机（`ai/credentials.bin`），不写配置文件、不上传。

---

## 导入与导出

导入逻辑在 `App.tsx`：文件选择器支持 `.md`、`.markdown`、`.txt`；`.md`/`.markdown` 按原文保存，`.txt` 按行转为简单段落后保存，加载时由编辑器转 Markdown；新笔记落在当前活动分类下。

导出：当前活动笔记可导出为 Markdown、纯文本、Word（`.docx`，依赖 `docx`）或 PDF；若内容仍是历史 HTML，导出前经 `turndown` 转 Markdown。

---

## 主题与样式

主题变量定义在 `src/index.css`，通过 Tailwind v4 `@theme` token 与 CSS 变量提供给组件。

- 主题应用逻辑在 `src/utils/theme.ts`：预设主题用 class 控制，自定义主题用 `documentElement.style.setProperty` 写入变量，变化经 `tile-theme-sync` 同步给磁贴/画布磁贴窗口。
- 组件样式约束：优先使用 `bg-bg-primary`、`text-text-muted`、`bg-accent`、`border-border` 等 token；不在 `className` 硬编码普通 UI 颜色。磨砂玻璃仅放在 `.surface-glass::before`，不放卡片上（带 filter 的祖先会成为 `position:fixed` 的包含块）。
- 改动 UI 后建议运行 `npm run verify:ui-polish`（14 条静态审计 + 48 组对比度实测）。

---

## i18n

文件：`src/utils/i18n.ts`，导出 `t(lang, key)` 与 `tWithParams(lang, key, params)`。

新增 UI 文本必须：

1. 在 `TranslationKeys` 中新增 key。
2. 在 `zh` 和 `en` 对象里都补齐翻译。
3. 组件通过 `useSettingsStore(s => s.lang)` 获取语言。

不要绕过 typed translation table 写普通 UI 文案。

---

## Tauri 后端

Rust 侧职责（`src-tauri/src/`）：

- `lib.rs`：注册 opener、fs、dialog、global-shortcut、deep-link、http、single-instance 等插件；创建系统托盘菜单（Show Window / Quit）；左键点击托盘显示主窗口；拦截普通关闭事件隐藏到托盘；`quit_app` command 真正退出；第二实例唤起已有主窗口。
- `storage.rs`：可迁移数据目录（见上文）。
- `window_bg.rs`：窗口背景（玻璃/模糊）绘制。

关键约束：

- `src-tauri/Cargo.toml` 的 `[lib] name` 必须是 `qing_notepad_lib`。
- `src-tauri/src/main.rs` 必须调用 `qing_notepad_lib::run()`。
- Tauri v2 权限写在 `src-tauri/capabilities/default.json`，不是 `tauri.conf.json`。
- `tauri.conf.json` 的 `devUrl` 是 `http://localhost:8787`，Vite 端口必须匹配。
- 不要随意改 Tauri library name、devUrl、Vite 端口。

---

## Release Workflow

发布 workflow：`.github/workflows/release.yml`

触发方式：

- 推送 `v*` tag，例如 `v0.7.0`
- 手动 `workflow_dispatch`

流程：

1. `actions/checkout@v7`
2. `actions/setup-node@v6`，Node.js 22，npm cache
3. `dtolnay/rust-toolchain@stable`
4. `Swatinem/rust-cache@v2`（缓存 `src-tauri`）
5. `npm ci`
6. 若由 tag 触发：运行 `npm run version:set -- "${{ github.ref_name }}"`，把 tag 名同步进各清单
7. `tauri-apps/tauri-action@v1` 构建并创建 GitHub Release

要点：

- **发布说明即 `releaseBody`** 中维护的 Markdown，会作为 Release 描述附上；版本发布前应同步检查：release body 是否覆盖本次新增/改进/修复/注意，README 的用户功能说明是否与之一致。
- `releaseName` 用 `Qing Notepad v__VERSION__`，`__VERSION__` 由 action 从 tag 替换。
- `tauri.conf.json` 的 bundle target 当前为 `nsis`；Release 产物以实际上传资源为准（`QingNotepad_<version>_x64-setup.exe` 与自包含 `QingNotepad.exe`）。
- **禁止从分支 ref 手动触发**（会被跳过版本同步）；只允许 `v*` tag 或 `workflow_dispatch`。
- CI 中 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 为公开 publishable 值，随包分发；`VITE_COLLAB_URL` 取自仓库 `vars`。**`SERVICE_ROLE_KEY` 绝不可写入桌面应用、提交 Git 或放进安装包。**

---

## 开发注意事项

- 改动前先读相关 store、component、utils，行为通常分散在三处。
- 用户数据格式要向后兼容，尤其是 `notes/index.json` 与 `.md` 内容文件；旧版纯数组 index、历史 HTML 正文都要能加载。
- 置顶项目的删除、拖拽限制是刻意行为。
- 新窗口必须补 capabilities 与 scope。
- 新 UI 文案必须补中英文翻译。
- 新设置项必须在 store、加载、保存和默认值中一起处理。
- 修改主题时同时考虑主窗口、磁贴窗口与便签窗口。
- 数据目录可迁移：任何新增的「打开/读取用户文件」能力都要走已注册的 scope 或 `open_data_path`，不要新增 `**` 通配。
- 不要随意改 Tauri library name、devUrl、Vite 端口。
- 如果更新发布能力，先看 `.github/workflows/release.yml`。

---

## 贡献前检查

建议在提交前运行：

```bash
npx tsc --noEmit
npm run build
```

如果涉及 Tauri、窗口、托盘、快捷键、文件系统权限或打包流程，再运行：

```powershell
. .\env.ps1
npm run tauri build
```

涉及 UI 改动时额外运行 `npm run verify:ui-polish`。

---

## 许可证

MIT License
