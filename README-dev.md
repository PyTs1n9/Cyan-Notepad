# Cyan Notepad - 开发者文档

本文档面向开发者和 AI coding agent，描述当前项目结构、开发命令、数据模型、发布流程和常见维护约束。产品功能和下载说明请阅读 [README.md](./README.md)。

---

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri v2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 状态管理 | Zustand 5 |
| 样式 | Tailwind CSS v4 + CSS 变量主题 |
| Markdown | `marked` 预览，`turndown` 兼容历史 HTML 转 Markdown |
| 图标 | `lucide-react` |
| 本地存储 | `@tauri-apps/plugin-fs` |
| 文件对话框 | `@tauri-apps/plugin-dialog` |
| 外链打开 | `@tauri-apps/plugin-opener` |
| 全局快捷键 | `@tauri-apps/plugin-global-shortcut` |
| 单实例 | `tauri-plugin-single-instance` |

当前版本号为 `0.2.1`。版本号由以下位置共用：

- `package.json`
- `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src/components/Settings/AboutModal.tsx`

请使用以下命令统一更新这些文件，避免手动修改遗漏：

```bash
npm run version:set -- v0.2.1
```

命令接受带或不带 `v` 前缀的语义化版本号，例如 `0.2.2` 或 `v0.2.2`。发布说明中的版本和内容仍需在 `.github/workflows/release.yml` 中按本次发布单独维护。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 仅启动 Vite renderer，固定端口 `8787` |
| `npm run tauri dev` | 启动完整 Tauri 桌面开发模式 |
| `npx tsc --noEmit` | TypeScript 类型检查 |
| `npm run build` | 执行 `tsc && vite build`，构建前端产物 |
| `npm run tauri build` | 构建 Windows 桌面安装包 |

`npm run tauri ...` 实际执行 `scripts/tauri-with-cleanup.mjs`。该脚本会调用本地 `@tauri-apps/cli`，并在 `dev` 前后清理 `src-tauri/target/debug/build` 和 `.fingerprint` 中过多的历史调试构建目录，默认最多保留 3 组。

在 Windows PowerShell 中，`npx tsc --noEmit` 可能因本机脚本执行策略拦截 `npx.ps1`。如果只是被执行策略拦截，而不是 TypeScript 报错，记录在最终说明里即可。

---

## Windows 环境

Tauri / Rust 构建需要 MSVC 链接器。项目提供了 `env.ps1`，每次运行 Tauri 命令前建议在 PowerShell 中加载：

```powershell
. .\env.ps1
npm run tauri dev
```

`env.ps1` 中的 MSVC 和 Windows SDK 版本号必须匹配本机安装路径，例如：

- `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\...`
- `C:\Program Files (x86)\Windows Kits\10\Lib\...`

CI 发布流程使用 `windows-latest`、Node.js 22、Rust stable 和 `tauri-apps/tauri-action@v1`。

---

## 项目结构

```text
Todolist-vibe/
├── src/
│   ├── components/
│   │   ├── Editor/
│   │   │   └── NoteEditor.tsx      # Markdown 主工作区：源码 / 预览 / 分屏
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx         # 导航、分类、笔记列表、导入导出、拖拽
│   │   │   └── TitleBar.tsx        # 自定义标题栏、窗口控制、主操作入口
│   │   ├── Settings/
│   │   │   ├── AboutModal.tsx      # 关于、检查更新、GitHub、赞助入口
│   │   │   └── SettingsModal.tsx   # 主题、语言、快捷键、自动保存
│   │   ├── Sticky/
│   │   │   └── StickyNote.tsx      # 可编辑独立便签窗口
│   │   ├── Tile/
│   │   │   └── TileView.tsx        # 只读磁贴预览窗口
│   │   └── Todo/
│   │       └── TodoView.tsx        # 待办列表、置顶、截止日期、筛选、拖拽
│   ├── stores/
│   │   ├── todoStore.ts            # 待办状态
│   │   ├── noteStore.ts            # 笔记、分类、标签筛选
│   │   ├── fontStore.ts            # 字体列表
│   │   └── settingsStore.ts        # 主题、语言、快捷键、自动保存
│   ├── types/
│   │   └── index.ts                # 共享类型
│   ├── utils/
│   │   ├── storage.ts              # Tauri fs 持久化封装
│   │   ├── theme.ts                # 主题 class 和 CSS 变量应用
│   │   ├── i18n.ts                 # typed zh/en 翻译表
│   │   ├── shortcutManager.ts      # 全局快捷键注册
│   │   ├── stickyManager.ts        # sticky-* 窗口创建和追踪
│   │   ├── tile.ts                 # tile-* 窗口创建和主题同步
│   │   └── externalLinks.ts        # 预览区外链处理
│   ├── App.tsx                     # 初始化、持久化、主题、导入导出、布局
│   ├── main.tsx                    # 根据 query 渲染 App / TileView / StickyNote
│   └── index.css                   # Tailwind v4 token、主题变量、窗口样式
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                  # 插件、托盘、单实例、关闭到托盘、quit_app
│   │   └── main.rs                 # 调用 cyan_notepad_lib::run()
│   ├── capabilities/
│   │   └── default.json            # main / sticky-* / tile-* 权限
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/
│   └── tauri-with-cleanup.mjs      # Tauri CLI 包装与调试缓存清理
├── env.ps1
├── package.json
└── vite.config.ts
```

---

## 入口与窗口

`src/main.tsx` 根据 URL query 选择渲染入口：

- 默认：`<App />`
- `/?tile=1&noteId=<id>`：`<TileView />`
- `/?sticky=<id>`：`<StickyNote />`

Tauri 权限在 `src-tauri/capabilities/default.json` 中声明，窗口 label 覆盖：

```json
["main", "sticky-*", "tile-*"]
```

新增窗口类型时，需要同步：

- `src/main.tsx` 的入口选择
- 创建窗口的 util
- capabilities 中的 window label 和权限

---

## 状态模型

### Todo Store

文件：`src/stores/todoStore.ts`

`Todo` 字段：

- `id`
- `title`
- `completed`
- `priority`: `low | medium | high`
- `pinned`
- `dueDate`
- `createdAt`
- `order`

排序规则：

1. 置顶项在最上方。
2. 未完成项排在已完成项前。
3. 手动拖拽会更新 `order`，但置顶项不能被拖动。

置顶待办不能删除，避免误操作。

### Note Store

文件：`src/stores/noteStore.ts`

`Note` 字段：

- `id`
- `title`
- `content`
- `tags`
- `categoryId`
- `pinned`
- `order`
- `createdAt`
- `updatedAt`

`NoteCategory` 字段：

- `id`
- `name`
- `order`
- `createdAt`

分类规则：

- `activeCategoryId = null` 表示全部笔记。
- `UNCATEGORIZED_CATEGORY_ID` 表示未分类笔记。
- 删除分类会把该分类下笔记移回未分类。
- 笔记可在同分类内拖拽排序，也可拖到分类按钮上移动。
- 置顶笔记不能拖动或删除。

### Settings Store

文件：`src/stores/settingsStore.ts`

设置项包括：

- `theme`: `dark | blue | yellow | green | custom`
- `lang`: `zh | en`
- `customColors`
- `savedPresets`，最多 5 套
- `shortcuts.toggleWindow`，默认 `Ctrl+Space`
- `autoSaveInterval`: `0 | 10000 | 30000 | 60000`

切换预设主题时会同步 `customColors`，便于在设置面板中继续微调。

---

## 数据持久化

所有持久化集中在 `src/utils/storage.ts`，通过 Tauri fs 插件读写：

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

`notes/index.json` 当前结构：

```json
{
  "notes": [],
  "categories": []
}
```

兼容逻辑：

- 旧版 `index.json` 如果是纯数组，会被当作 `notes` 读取，`categories` 为空。
- 如果索引为空或损坏，会扫描 `notes/*.md` 尝试恢复笔记列表。
- 内容文件扩展名是 `.md`，但历史版本可能存过 TipTap HTML。
- `NoteEditor` 加载到 HTML 时会通过 `turndown` 转成 Markdown。

自动持久化位置：

- `App.tsx`：todos、note index、fonts、settings。
- `NoteEditor.tsx`：当前笔记内容，支持 `Ctrl+S` 和设置中的周期自动保存。
- `StickyNote.tsx`：独立窗口编辑后保存并通过事件通知主窗口。

---

## 编辑器流程

当前主编辑器是 Markdown 工作区，不再暴露旧的 WYSIWYG / MD 双模式切换。

`NoteEditor.tsx` 负责：

- 加载活动笔记内容。
- 检测历史 HTML 并转换为 Markdown。
- 提供源码、预览、分屏三种视图。
- 通过 `marked` 渲染预览，并对用户输入 HTML 做转义。
- 源码与预览双向滚动同步。
- 切换活动笔记前保存上一条笔记。
- 丢弃过期的异步加载结果，避免快速切换笔记时串内容。
- 监听 `sticky:note-saved`，同步便签窗口保存的内容。
- 保存时发出 `sticky:note-updated`，通知已打开便签窗口。

外链点击由 `src/utils/externalLinks.ts` 处理，避免 WebView 内默认导航造成无法回退的问题。

---

## 导入与导出

导入逻辑在 `App.tsx`：

- 文件选择器支持 `.md`、`.markdown`、`.txt`。
- `.md` / `.markdown` 按原文保存。
- `.txt` 会按行转为简单 HTML 段落后保存，加载时再由编辑器转换为 Markdown。
- 新笔记会落在当前活动分类下。

导出逻辑：

- 当前活动笔记可导出为 Markdown 或文本。
- 如果存储内容仍是历史 HTML，导出前会通过 `turndown` 转 Markdown。

---

## 主题与样式

主题变量定义在 `src/index.css`，通过 Tailwind v4 `@theme` token 和 CSS 变量提供给组件。

主题应用逻辑在 `src/utils/theme.ts`：

- 预设主题通过 class 控制。
- 自定义主题通过 `documentElement.style.setProperty` 写入变量。
- 主题变化会通过 `tile-theme-sync` 同步给磁贴窗口。

组件样式约束：

- 优先使用 `bg-bg-primary`、`text-text-muted`、`bg-accent`、`border-border` 等 token。
- 不要在组件 `className` 中硬编码普通 UI 颜色。
- 用户内容颜色、图片、图标预览、主题色块等可以使用 inline style。

---

## i18n

文件：`src/utils/i18n.ts`

导出：

- `t(lang, key)`
- `tWithParams(lang, key, params)`

新增 UI 文本必须：

1. 在 `TranslationKeys` 中新增 key。
2. 在 `zh` 和 `en` 对象里都补齐翻译。
3. 组件通过 `useSettingsStore(s => s.lang)` 获取语言。

不要绕过 typed translation table 写普通 UI 文案。

---

## Tauri 后端

文件：`src-tauri/src/lib.rs`

当前 Rust 侧职责：

- 注册 opener、fs、dialog、global-shortcut、single-instance 插件。
- 创建系统托盘菜单：Show Window / Quit。
- 左键点击托盘显示主窗口。
- 拦截普通关闭事件，将窗口隐藏到托盘。
- 通过 `quit_app` command 实现真正退出。
- 第二个实例启动时唤起已有主窗口。

关键约束：

- `src-tauri/Cargo.toml` 的 `[lib] name` 必须是 `cyan_notepad_lib`。
- `src-tauri/src/main.rs` 必须调用 `cyan_notepad_lib::run()`。
- Tauri v2 权限写在 `src-tauri/capabilities/default.json`，不是 `tauri.conf.json`。
- `tauri.conf.json` 的 `devUrl` 是 `http://localhost:8787`，Vite 端口必须匹配。

---

## Release Workflow

发布 workflow：`.github/workflows/release.yml`

触发方式：

- 推送 `v*` tag，例如 `v0.2.0`
- 手动 `workflow_dispatch`

流程：

1. `actions/checkout@v7`
2. `actions/setup-node@v6`，Node.js 22，npm cache
3. `dtolnay/rust-toolchain@stable`
4. `Swatinem/rust-cache@v2`
5. `npm ci`
6. `tauri-apps/tauri-action@v1` 构建并创建 GitHub Release

发布说明目前内置在 workflow 的 `releaseBody` 中。版本发布前应同步检查：

- release body 是否覆盖本次新增、改进、修复、删除和已知问题。
- README 的用户功能说明是否与 release body 一致。
- 运行 `npm run version:set -- v<版本号>`，确认应用、前端依赖锁定和 Rust 包元数据的版本一致。
- `tauri.conf.json` 的 bundle target 当前为 `nsis`，Release 产物名称以实际上传资源为准。

---

## 开发注意事项

- 改动前先读相关 store、component、utils，行为通常分散在三处。
- 用户数据格式要向后兼容，尤其是 `notes/index.json` 和 `.md` 内容文件。
- 置顶项目的删除、拖拽限制是刻意行为。
- 新窗口必须补 capabilities。
- 新 UI 文案必须补中英文翻译。
- 新设置项必须在 store、加载、保存和默认值中一起处理。
- 修改主题时同时考虑主窗口、磁贴窗口和便签窗口。
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

---

## 许可证

MIT License
