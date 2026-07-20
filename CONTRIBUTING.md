# 贡献指南

感谢你为 Cyan Notepad 提交代码、文档、问题反馈或功能建议。

Cyan Notepad 是一个以 Windows 为主要目标平台的 Tauri v2 + React 19 + TypeScript 桌面应用。提交贡献前，建议先阅读 [README.md](README.md)、[README-dev.md](README-dev.md) 和仓库根目录的 `AGENTS.md`，了解项目结构、开发命令与数据格式。

## 开始之前

- 先搜索已有的 Issue 和 Pull Request，避免重复提交。
- 较大的功能或行为变化，建议先创建 Issue 讨论方案。
- 不要提交账号密钥、Supabase `service_role` 密钥、个人数据、构建产物或本地应用数据。
- 本项目当前主要面向 Windows；涉及 Tauri、托盘、窗口或系统快捷键的改动，请尽量在 Windows 上验证。

## 本地开发环境

建议使用以下环境：

- Windows 10/11 x64
- Node.js 22
- Rust stable
- Visual Studio Build Tools（包含 MSVC 和 Windows SDK）

安装依赖：

```powershell
npm ci
```

只调试前端时：

```powershell
npm run dev
```

运行完整的 Tauri 桌面应用前，在 PowerShell 中加载 MSVC 环境：

```powershell
. .\env.ps1
npm run tauri dev
```

如需调试在线协作服务，另开终端运行：

```powershell
npm run collab:dev
```

在线工作台还需要根据 `README.md` 和 `docs/online-workspace.md` 配置 Supabase 与协作服务环境变量。不要把这些变量中的私密密钥提交到 Git。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端开发服务器，端口为 `8787` |
| `npm run tauri dev` | 启动完整 Tauri 桌面应用 |
| `npx.cmd tsc --noEmit` | 执行 TypeScript 类型检查 |
| `npm run build` | 类型检查并构建前端生产版本 |
| `npm run tauri build` | 构建 Windows Tauri 安装包 |
| `npm run collab:dev` | 启动本地在线协作服务 |
| `npm run collab:build` | 构建在线协作服务 |

PowerShell 如果因脚本执行策略拦截 `npx.ps1`，可以使用上面的 `npx.cmd` 形式；这属于本机执行策略问题，不是 TypeScript 错误。

## 推荐的开发流程

1. 从最新的默认分支创建分支，例如 `feature/markdown-export`、`fix/sticky-save` 或 `docs/contributing`。
2. 保持改动范围清晰，避免在同一个 Pull Request 中混入无关重构或格式化。
3. 按照下方的项目约定实现并验证改动。
4. 提交清晰的 commit。项目没有强制 commit 格式，建议使用 `feat:`、`fix:`、`docs:`、`refactor:`、`chore:` 等前缀。
5. 推送分支并创建 Pull Request，完整填写改动内容、验证方式和已知限制。

## 代码约定

### React、TypeScript 与状态

- 使用 TypeScript，优先保持现有组件、store 和 utility 的职责边界。
- 应用源码优先使用 `@/` 路径别名导入。
- 修改行为前先阅读相关的 Zustand store、组件和持久化工具；一个功能通常会横跨这几个位置。
- 不要为了小改动顺便重写无关代码。

### 国际化

新增或修改界面文字时：

1. 在 `src/utils/i18n.ts` 的 `TranslationKeys` 中增加 key。
2. 同时补充 `zh` 和 `en` 翻译。
3. 在组件中通过 `useSettingsStore(s => s.lang)` 和 `t()`/`tWithParams()` 使用。

不要在普通 UI 中绕过 typed translation table 直接写固定文字。

### 主题与样式

- 优先使用已有主题 token，例如 `bg-bg-primary`、`text-text-muted`、`bg-accent` 和 `border-border`。
- 不要在组件的 `className` 中硬编码会随主题变化的颜色。
- 用户选中的颜色、编辑器内容颜色和颜色预览可以使用 inline style。
- 改动主题时，同时检查主窗口、便签窗口和磁贴窗口的显示与主题同步。

### 数据兼容性

- 所有本地持久化都通过 `src/utils/storage.ts` 处理。
- 不要随意改变 `%APPDATA%/com.cyan-notepad.app/data/` 下的文件结构。
- `notes/index.json` 存储笔记元数据；`.md` 内容文件历史上可能保存 Markdown，也可能保存 TipTap HTML，读取时必须保持兼容。
- 修改数据结构时，提供旧数据的读取兼容或迁移逻辑，并在 Pull Request 中说明。
- 不要把真实用户数据复制进仓库或测试截图。

### Tauri 窗口与权限

新增窗口或修改窗口路由时，必须同步检查：

- `src/main.tsx` 的 query 路由；
- 对应的窗口创建 utility；
- `src-tauri/capabilities/default.json` 中的窗口 label 和权限。

现有的 `main`、`sticky-*` 和 `tile-*` 窗口权限不能被意外移除。不要随意修改 Tauri library name、`devUrl` 或 Vite 的 `8787` 端口。

## 提交前检查

至少运行：

```powershell
npx.cmd tsc --noEmit
npm run build
```

如果改动涉及 Rust、Tauri 窗口、托盘、快捷键、文件权限或安装包，再运行：

```powershell
. .\env.ps1
npm run tauri build
```

涉及界面改动时，请手动检查至少一个深色或彩色主题，并检查中文/英文切换。涉及笔记、待办、导入导出或窗口同步时，请覆盖对应的新增、编辑、删除和重新启动后的数据恢复流程。

目前项目没有独立的自动化测试脚本，因此 Pull Request 应在描述中列出实际执行过的命令和手动验证步骤。

## Pull Request 要求

Pull Request 描述请包含：

- 改动解决的问题或实现的需求；
- 主要改动范围；
- 执行过的检查命令；
- 手动验证步骤和结果；
- UI 改动的截图或录屏；
- 是否涉及数据格式、配置、权限或迁移；
- 已知限制或后续工作。

请保持一个 Pull Request 聚焦一个主题。审查过程中如需修改，请在原分支追加修订，避免反复创建内容相同的 Pull Request。

## Issue 与安全问题

Bug 反馈请尽量提供：应用版本、Windows 版本、复现步骤、预期行为、实际行为、相关日志和截图。日志或截图中请先移除路径中的个人信息、账号信息和密钥。

安全问题不要直接公开到 Issue；请先通过项目 README 中列出的维护者邮箱联系，并提供受影响版本、复现方式和必要的技术细节。

## 许可证

提交到本项目的贡献将按照仓库的 [MIT License](LICENSE) 发布。提交内容前，请确认你拥有相应代码、图片、字体或文档的授权。
