# BaiQingTodo

基于 **Tauri v2 + React + TypeScript** 构建的 Windows 桌面工具箱，集待办事项管理、富文本记事本、主题定制、中英文切换于一体。

---

## 功能特性

### 📋 待办事项

- 创建、完成、删除任务
- 三级优先级（低 / 中 / 高）
- 筛选视图：全部 / 进行中 / 已完成
- 实时统计：总数与已完成数

### 📝 富文本记事本

- **双模式编辑**：所见即所得（TipTap）与 Markdown 源码模式自由切换
- **MD 分屏预览**：左侧源码编辑 + 右侧实时预览，双向滚动同步
- **工具栏可隐藏**：一键收起工具栏，获得沉浸式编辑体验
- **丰富的排版能力**：
  - 标题 H1 / H2 / H3、段落、引用块、分隔线
  - 粗体 / 斜体 / 下划线 / 删除线 / 高亮
  - 有序列表 / 无序列表
  - 文字颜色（取色器）与字号（12px ~ 48px）
  - 文本对齐（左 / 中 / 右）
- **图片插入**：本地图片自动转 Base64 内嵌
- **标签系统**：编辑器中插入 `#标签`，侧栏按标签筛选笔记
- **自定义字体**：导入 `.ttf` / `.otf` / `.woff` / `.woff2` 字体文件
- **导入 Markdown 文件**：批量导入本地 `.md` 文件自动创建笔记
- **自动保存**：800ms 防抖自动写入磁盘
- **可调节侧边栏**：拖拽手柄调整宽度（180px ~ 400px）

### 🎨 主题系统

- **4 套预设主题**：深色 / 蓝调 / 忧郁黄 / 清新绿，一行切换
- **自定义调色板**：5 个颜色字段（主背景、次背景、侧边栏、主文字、强调色）
- **保存预设**：最多保存 5 个自定义配色方案，含名称管理与一键应用

### 🌐 国际化

- 中文 / English 双语言切换，全界面文本覆盖

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

## 环境要求

- **Node.js** ≥ 18
- **Rust**（stable，通过 [rustup](https://rustup.rs/) 安装）
- **Windows** + [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（提供 MSVC 链接器）

---

## 项目结构

```
Todolist-vibe/
├── src/
│   ├── components/
│   │   ├── Editor/
│   │   │   ├── NoteEditor.tsx      # 编辑器主组件（双模式 + 工具栏切换 + 滚动同步）
│   │   │   └── Toolbar.tsx         # 排版工具栏（WYSIWYG / MD 双模式适配）
│   │   ├── Layout/
│   │   │   └── Sidebar.tsx         # 侧边栏（导航 / 笔记列表 / 标签筛选 / 导入MD）
│   │   ├── Settings/
│   │   │   └── SettingsModal.tsx   # 设置弹窗（主题预设 / 调色板 / 预设管理 / 语言）
│   │   └── Todo/
│   │       └── TodoView.tsx        # 待办事项视图
│   ├── stores/
│   │   ├── todoStore.ts            # 待办事项状态
│   │   ├── noteStore.ts            # 笔记状态
│   │   ├── fontStore.ts            # 字体状态
│   │   └── settingsStore.ts        # 设置状态（主题 / 语言 / 自定义颜色 / 保存预设）
│   ├── types/
│   │   └── index.ts                # TypeScript 类型定义
│   ├── utils/
│   │   ├── i18n.ts                 # 国际化（zh / en）
│   │   └── storage.ts              # Tauri fs 封装（读写 todos / notes / fonts / settings）
│   ├── App.tsx                     # 根组件（数据加载 / 主题应用 / 侧边栏拖拽 / MD 导入）
│   ├── index.css                   # Tailwind + CSS 变量主题定义（4 套预设）
│   └── main.tsx                    # React 入口
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                  # Tauri 插件注册
│   │   └── main.rs                 # Rust 入口
│   ├── capabilities/
│   │   └── default.json            # 权限配置
│   ├── Cargo.toml
│   └── tauri.conf.json
├── vite.config.ts                  # Vite 配置（端口 8787，路径别名 @/ → src/）
├── tsconfig.json
└── package.json
```

---

## 快速开始

### 1. 安装 Rust 工具链

项目基于 Tauri v2，底层依赖 Rust 编译。通过 [rustup](https://rustup.rs/) 一键安装：

```powershell
# 下载并安装 rustup（默认安装 stable 工具链，包含 rustc 和 cargo）
winget install --id Rustlang.Rustup
```

或访问 [https://rustup.rs/](https://rustup.rs/) 下载 `rustup-init.exe` 手动安装。

安装完成后，**关闭并重新打开 PowerShell**，验证安装：

```powershell
rustc --version   # 应显示 rustc 1.xx.x
cargo --version   # 应显示 cargo 1.xx.x
```

> **常见问题**：如果提示 `cargo : 无法将"cargo"项识别为 cmdlet`，说明 Rust 未加入 PATH。运行以下命令临时修复，或参考下方「永久配置」：
> ```powershell
> $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
> ```

### 2. 安装 MSVC 编译工具（Windows 必需）

下载并安装 [Microsoft Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，安装时勾选 **"使用 C++ 的桌面开发"** 工作负载。

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

> 路径中的 MSVC / Windows SDK 版本号（如 `14.44.35207`、`10.0.26100.0`）需与本机实际安装的版本一致。可在 `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\` 下查看已安装版本。

### 5. 启动开发模式

```bash
npm run tauri dev
```

前端开发服务器运行在端口 `8787`，支持热更新。

---

## 永久环境配置（推荐）

为避免每次打开终端都要手动设置环境变量，可将以下路径添加到系统 PATH：

### Rust 工具链

将 `%USERPROFILE%\.cargo\bin` 添加到系统环境变量 `Path` 中：

1. 按 `Win + R`，输入 `sysdm.cpl`，点击「高级」→「环境变量」
2. 在「用户变量」中找到 `Path`，双击编辑
3. 新建一条：`%USERPROFILE%\.cargo\bin`
4. 确定保存，重新打开终端即可生效

### MSVC 编译工具

可在项目根目录创建脚本文件 `env.ps1`，每次开发前执行一次即可：

```powershell
# env.ps1 — 一键配置 Tauri 编译环境
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:Path = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64;$env:Path"
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64"
$env:INCLUDE = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\include;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\shared;C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\cppwinrt"
$env:WindowsSdkDir = "C:\Program Files (x86)\Windows Kits\10\"
```

使用方式：

```powershell
. .\env.ps1          # 加载环境变量
npm run tauri dev    # 启动开发
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 仅启动 Vite 前端开发服务器（端口 8787） |
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

- 笔记内容以 HTML（TipTap 输出）或 Markdown 存储在 `.md` 文件中
- `index.json` 存储元数据，列表加载时不读取内容文件
- 设置变更自动持久化到 `settings.json`

---

## 使用说明

### 待办事项

1. 应用默认进入「待办事项」页面
2. 顶部输入框输入内容 → 选择优先级 → 点击「添加」或 `Enter`
3. 点击任务左侧圆圈标记完成（再次点击恢复）
4. 悬停任务显示右侧删除按钮
5. 顶部筛选标签切换「全部 / 进行中 / 已完成」

### 记事本

1. 左侧导航栏点击「记事本」→ 点击「新建笔记」或「导入 Markdown」
2. 笔记列表中选择笔记开始编辑
3. **模式切换**：顶部「记事本模式」/「MD 模式」按钮切换
   - 记事本模式：TipTap 所见即所得编辑器
   - MD 模式：左侧源码编辑 + 右侧实时预览，双向滚动同步
4. **工具栏隐藏**：点击右上角 🔧 按钮收起/展开工具栏
5. **排版操作**：字体、字号、粗体、斜体、颜色、高亮、标题、列表、对齐、图片、分隔线、标签
6. **侧边栏调节**：拖拽侧边栏右边框调整宽度
7. 内容自动保存，底部标签区域可按标签筛选笔记

### 设置

1. 侧边栏底部点击「设置」打开设置弹窗
2. **主题颜色**：4 个预设主题卡片一键切换，切换后调色板自动同步
3. **自定义调色板**：5 个颜色选择器自由调色
4. **保存预设**：点击左侧按钮保存当前配色（最多 5 个）
5. **选择预设**：点击右侧下拉框查看、应用或删除已保存方案
6. **语言**：中文 / English 切换

---

## 开发计划

- [ ] 网页端实时保存数据库
- [ ] 网页端和桌面端同步

## 贡献指南

欢迎提交 Issue 和 Pull Request！提交前请：

1. 确保代码风格与项目一致
2. 新增功能需包含必要的文档说明

## 许可证

MIT License

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送邮件 1990629881@qq.com

---

**免责声明**: 本工具仅供学习和研究使用，请遵守相关法律法规和平台使用条款。使用者需自行承担因使用本工具产生的任何法律责任。
