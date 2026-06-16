# BaiQingTodo - 开发者手册

本文档面向开发者，介绍项目架构、环境配置、开发命令等内容。如需了解产品功能和使用方法，请参阅 [README.md](./README.md)。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 富文本编辑器 | TipTap 3（基于 ProseMirror） |
| MD 解析 | turndown（HTML→MD）+ marked（MD→HTML） |
| 状态管理 | Zustand 5（4 个 Store） |
| 样式方案 | Tailwind CSS v4 + CSS 自定义属性主题 |
| 图标库 | Lucide React |
| 本地存储 | Tauri fs 插件（文件系统读写） |
| 后端 | Rust（仅使用 Tauri 插件，无自定义命令） |

---

## 项目架构

### 目录结构

```
Todolist-vibe/
├── src/
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── NoteEditor.tsx      # 编辑器主组件（双模式 + 工具栏切换 + 滚动同步）
│   │   │   └── Toolbar.tsx         # 排版工具栏（WYSIWYG / MD 双模式适配）
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx         # 侧边栏（导航 / 笔记列表 / 标签筛选 / 导入MD）
│   │   │   └── TitleBar.tsx        # 标题栏组件
│   │   ├── Settings/
│   │   │   ├── AboutModal.tsx      # 关于弹窗
│   │   │   └── SettingsModal.tsx   # 设置弹窗（主题预设 / 调色板 / 预设管理 / 语言）
│   │   └── Todo/
│   │       └── TodoView.tsx        # 待办事项视图
│   ├── stores/
│   │   ├── todoStore.ts            # 待办事项状态（CRUD、筛选）
│   │   ├── noteStore.ts            # 笔记状态（元数据、活动笔记、标签筛选）
│   │   ├── fontStore.ts            # 字体状态（内置 + 自定义导入）
│   │   └── settingsStore.ts        # 设置状态（主题 / 语言 / 自定义颜色 / 保存预设）
│   ├── types/
│   │   └── index.ts                # TypeScript 类型定义
│   ├── utils/
│   │   ├── i18n.ts                 # 国际化（zh / en 双语言）
│   │   └── storage.ts              # Tauri fs 封装（读写 todos / notes / fonts / settings）
│   ├── App.tsx                     # 根组件（数据加载 / 主题应用 / 侧边栏拖拽 / MD 导入）
│   ├── index.css                   # Tailwind + CSS 变量主题定义（4 套预设）
│   └── main.tsx                    # React 入口
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                  # Tauri 插件注册
│   │   └── main.rs                 # Rust 入口
│   ├── capabilities/
│   │   └── default.json            # 权限配置（Tauri v2 权限系统）
│   ├── Cargo.toml                  # Rust 依赖配置
│   └── tauri.conf.json             # Tauri 应用配置
├── env.ps1                         # 开发环境变量一键配置脚本
├── vite.config.ts                  # Vite 配置（端口 8787，路径别名 @/ → src/）
├── tsconfig.json                   # TypeScript 配置
└── package.json                    # 前端依赖与脚本
```

### 核心组件职责

| 组件 | 职责 |
|------|------|
| `App.tsx` | 根组件：数据加载、主题应用、侧边栏拖拽调整、设置弹窗、MD 导入处理 |
| `Sidebar.tsx` | 导航切换、笔记列表（含删除）、标签筛选、导入 Markdown 按钮、设置按钮、动态宽度 |
| `TodoView.tsx` | 待办事项 CRUD、优先级选择、筛选标签页 |
| `NoteEditor.tsx` | TipTap 编辑器（WYSIWYG 模式）+ textarea/preview 分屏（MD 模式）、模式切换、工具栏切换、滚动同步、turndown/marked 转换 |
| `Toolbar.tsx` | 排版工具栏，同时适配 WYSIWYG 和 MD 模式（MD 模式下插入 Markdown 语法） |
| `SettingsModal.tsx` | 4 个主题预设网格、自定义调色板（5 字段）、保存/选择预设分按钮与下拉菜单 |

### 状态管理

项目使用 4 个 Zustand Store 管理全局状态：

| Store | 文件 | 管理内容 |
|-------|------|---------|
| Todo Store | `stores/todoStore.ts` | 待办事项列表、筛选状态、CRUD 操作 |
| Note Store | `stores/noteStore.ts` | 笔记元数据、活动笔记 ID、标签筛选、删除 |
| Font Store | `stores/fontStore.ts` | 内置字体 + 导入的自定义字体 |
| Settings Store | `stores/settingsStore.ts` | 主题类型、语言、自定义颜色、已保存预设（最多 5 个）、`THEME_COLORS` 预设映射 |

### 数据流

- 笔记内容以 HTML（TipTap 输出）或 Markdown 存储在 `.md` 文件中，元数据存于 `index.json`
- 切换到 MD 模式：TipTap HTML → `turndown` → 纯 Markdown 写入 textarea
- 切换到 WYSIWYG 模式：Markdown → `marked` → HTML 写入 TipTap
- 自动保存：800ms 防抖，通过 `setTimeout` refs 实现
- 设置（主题/语言/自定义颜色/预设）：变更即自动持久化，启动时加载
- 侧边栏宽度：通过 `mousedown` / `mousemove` / `mouseup` 事件在 `App.tsx` 中拖拽调整

### 主题系统

- CSS 自定义属性定义在 `src/index.css`，默认主题为蓝调
- 4 套预设主题类名：`.theme-dark`、`.theme-blue`、`.theme-yellow`、`.theme-green`
- 自定义主题通过 `App.tsx` 中 `documentElement.style.setProperty` 内联设置
- `settingsStore.ts` 中 `setTheme()` 在切换预设时自动同步 `customColors`
- 已保存预设持久化在 `settings.json` 中

### 国际化（i18n）

- `src/utils/i18n.ts` 导出 `t(lang, key)` 和 `tWithParams(lang, key, params)`
- 所有 UI 字符串定义在 `TranslationKeys` 类型中
- 组件通过 `useSettingsStore(s => s.lang)` 获取当前语言
- **新增 UI 文本时，必须同时在 `zh` 和 `en` 对象中添加对应 key**

### 样式规范

- 使用 Tailwind CSS v4（通过 `@tailwindcss/vite` 插件）
- 所有颜色必须引用 CSS 变量 token（如 `bg-bg-primary`、`text-text-muted`、`bg-accent`）
- **禁止在组件 `className` 中硬编码十六进制颜色值**，否则主题切换时不会更新

### 路径别名

- `@/` → `src/`（在 `vite.config.ts` 和 `tsconfig.json` 中配置）

---

## 环境要求

- **Node.js** ≥ 18
- **Rust** stable（通过 [rustup](https://rustup.rs/) 安装）
- **Windows** + [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（提供 MSVC 链接器）

---

## 快速开始

### 1. 安装 Rust 工具链

通过 [rustup](https://rustup.rs/) 一键安装：

```powershell
winget install --id Rustlang.Rustup
```

或访问 [https://rustup.rs/](https://rustup.rs/) 下载 `rustup-init.exe` 手动安装。

安装完成后，**关闭并重新打开 PowerShell**，验证安装：

```powershell
rustc --version   # 应显示 rustc 1.xx.x
cargo --version   # 应显示 cargo 1.xx.x
```

### 2. 安装 MSVC 编译工具（Windows 必需）

下载并安装 [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools-tools/)，安装时勾选 **"使用 C++ 的桌面开发"** 工作负载。

### 3. 安装前端依赖

```bash
npm install
```

### 4. 配置编译环境变量

每次打开新的 PowerShell 窗口，在运行 Tauri 命令前需设置以下环境变量：

```powershell
# 添加 Rust 到 PATH（如未永久配置）
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 添加 MSVC 链接器到 PATH
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$env:INCLUDE = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\include;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\shared;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt"
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"
```

> ⚠️ 路径中的 MSVC / Windows SDK 版本号（如 `14.44.35207`、`10.0.26100.0`）需与本机实际安装的版本一致。可在 `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\` 下查看已安装版本。

**快捷方式**：项目根目录已提供 `env.ps1` 脚本，一键配置：

```powershell
. .\env.ps1          # 加载环境变量
npm run tauri dev    # 启动开发
```

### 5. 启动开发模式

```bash
npm run tauri dev
```

前端开发服务器运行在端口 `8787`，支持热更新。

---

## 永久环境配置（推荐）

为避免每次打开终端都要手动设置环境变量，建议将以下路径添加到系统 PATH：

### Rust 工具链

将 `%USERPROFILE%\.cargo\bin` 添加到系统环境变量 `Path` 中：

1. 按 `Win + R`，输入 `sysdm.cpl`，点击「高级」→「环境变量」
2. 在「用户变量」中找到 `Path`，双击编辑
3. 新建一条：`%USERPROFILE%\.cargo\bin`
4. 确定保存，重新打开终端即可生效

### MSVC 编译工具

使用项目根目录的 `env.ps1` 脚本，每次开发前执行一次即可：

```powershell
. .\env.ps1
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动 Vite 前端开发服务器（端口 8787，无需 Rust 环境） |
| `npm run tauri dev` | 启动完整桌面应用（前端 + Rust 后端） |
| `npx tsc --noEmit` | TypeScript 类型检查 |
| `npm run build` | 构建前端静态资源 |
| `npm run tauri build` | 构建生产版本，生成 Windows 安装包 |

---

## 数据存储

所有数据持久化在 Windows 应用数据目录：

```
%APPDATA%/com.pytsingtodo.app/data/
├── todos.json          # 待办事项
├── fonts.json          # 自定义字体注册表
├── settings.json       # 主题 / 语言 / 自定义颜色 / 已保存预设
└── notes/
    ├── index.json      # 笔记元数据索引（ID / 标题 / 标签 / 时间）
    └── <uuid>.md       # 笔记内容（按需加载）
```

**说明：**
- 笔记内容以 HTML（TipTap 输出）或 Markdown 存储在 `.md` 文件中
- `index.json` 存储元数据，列表加载时无需读取内容文件，提升性能
- 设置变更自动持久化到 `settings.json`
- `saveNoteContent` 在 MD 模式下存储纯 Markdown，在 WYSIWYG 模式下存储 HTML；`loadNoteContent` 需兼容两种格式

---

## 开发注意事项

### Rust 入口

`main.rs` 必须调用 `pytsing_to_do_lib::run()`，该名称来自 `Cargo.toml` 中的 `[lib] name = "pytsing_to_do_lib"`，**不可修改为其他名称**。

### Tauri v2 权限

Tauri v2 的文件系统权限配置在 `src-tauri/capabilities/default.json` 中，**不是** `tauri.conf.json`。

### 命名导入

`@tiptap/extension-text-style` 中的 `TextStyle` 需要使用命名导入（named import），不能使用默认导入。

### 文件读取

使用 `@tauri-apps/plugin-fs` 中的 `readFile`，不要使用已废弃的 `readBinaryFile`。

### 国际化新增

添加新的 UI 文本时，必须同时在 `src/utils/i18n.ts` 的 `zh` 和 `en` 对象中添加对应 key，否则会导致 TypeScript 编译错误。

### 设置持久化

`App.tsx` 中的 `saveSettings` 包含 `savedPresets` 数组；`loadSettingsState` 在加载时需要进行类型转换。

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！提交前请：

1. 确保代码风格与项目一致
2. 新增 UI 文本需同时添加中英文翻译
3. 新增功能建议包含必要的说明

## 许可证

MIT License
