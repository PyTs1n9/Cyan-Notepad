# 提示词：第二阶段 —— 工作台 / 画布与笔记页外壳对齐

> 用法：整段交给 AI。第一阶段的 todo 部分已完成，本文件只描述第二阶段。
> 决策表已定稿，不要重新讨论；范围之外的东西不要动。

## 角色

你是 Qing Notepad（Tauri v2 + React 19 + TypeScript，Windows 桌面）的前端工程师。
第一阶段的成果：三个视图的**编辑卡片**顶部统一为 36px 条带（`Layout/ShellStrip.tsx`），内容与卡片齐平。
第二阶段要把**左卡片**也统一：任何视图的左卡片都必须是「rail + 细线 + 该视图的列表」，且编辑卡片必须齐平。

## 已定稿决策（不得再议）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 工作台侧栏位置 | 从 `WorkspaceView` 内部搬进左卡片，与 note / todo 同构 |
| 2 | 未登录态 | 左卡片**只留 rail**，编辑卡片给登录卡片 |
| 3 | 工作台头部 | 两层：36px 条带（文档名 + 发布/协作状态 + ⋯）+ 编辑器工具栏行（视图切换 / 高亮 / 滚动同步 / **权限下拉 / 发布按钮**） |
| 4 | 侧栏宽度与折叠 | 共用一条渲染路径，但**各页各自记忆**（`--notebook-sidebar-width` 给 note/todo，`--workspace-sidebar-width` 给 workspace） |
| 5 | 侧栏弹窗状态 | 新建 `workspaceUiStore`（只放 `dialog` / `dialogNotice` / `renameTarget` 等瞬时状态），不改 `workspaceStore` 的数据职责 |
| 6 | 空态条带 | 未打开文档时，条带显示**工作区名 + 文档数**，无操作按钮 |
| 7 | 画布 | 编辑卡片一并统一；画布列表浮层搬进左卡片（见 2B，可与 2A 分开验收） |

## 现状事实（已核对，勿重新推断）

| 位置 | 现实 |
| --- | --- |
| `App.tsx:1047` | 左卡片列表区条件是 `currentView !== "workspace" && currentView !== "canvas"` |
| `App.tsx:1084` | 左侧 sash 同样排除了 workspace / canvas；note 用 `SidebarResizeHandle variant="gutter"` |
| `App.tsx:1098-1102` | `<WorkspaceView sidebarCollapsed sidebarResizing sidebarCollapseAnimating onSidebarResizeStart onOpenAuth />` |
| `App.tsx:697` | `collapseProperty` 已按 sidebar 区分 `--workspace-sidebar-width`；`:992` 已注入该变量 |
| `Layout/shellLayout.ts:49` | `leftSidebarOffset(kind)`：notebook = `pad + 48 + gutter/2`；workspace = `editorLeft + 2.5`（因为它的 sash 原在自己视图内） |
| `Workspace/WorkspaceView.tsx:934-1180` | 侧栏 `aside`（`bg-bg-sidebar` 实底）+ 自带 `SidebarResizeHandle`（1178 行） |
| `Workspace/WorkspaceView.tsx:1298` | 工作区 `<section className="app-work-area-overlay ...">`，内部按状态渲染空态 / `CloudNoteEditor` |
| `Workspace/CloudNoteEditor.tsx:1381` | 根节点带 `bg-bg-primary`，破坏玻璃拟态 |
| `Workspace/CloudNoteEditor.tsx:1384` | 富头部 `flex flex-wrap ... border-b px-4 py-2`：标题 input + 视图切换 + 高亮 + 滚动同步 + 权限下拉 + 发布 + 协作状态 |
| `index.css:362-372` | `.app-has-custom-background .workspace-surface` / `.app-work-area-overlay` / `.workspace-editor-surface` 的背景覆盖 |
| `Canvas/CanvasView.tsx:1793` | 根 `<section className="canvas-surface ... bg-bg-primary">`，第二行是 `h-11` 工具栏（2247 行起是画布列表浮层） |

## 2A｜工作台（先做，独立验收）

### 任务 1：`stores/workspaceUi.ts`

`dialog`（`createWorkspace` / `joinWorkspace` / `newDocument` / `renameDocument`）、`dialogValue`、`dialogNotice`、`renamingDocumentId` 搬进新 store，并提供 `openDialog(kind)` / `closeDialog()` / `setDialogValue`。
**不要**把这些塞进 `workspaceStore`：`WorkspaceView` 用 `useWorkspaceStore()` 无选择器整体解构（约 97–129 行），任何弹窗开关都会重渲染整个视图。

### 任务 2：抽出 `Workspace/WorkspaceSidebar.tsx`

从 `WorkspaceView` 搬出 934–1180 行的 `aside` 及其全部交互：

- 工作区下拉、文档列表、发布状态筛选、拖拽排序、`⋯` 菜单、详情浮层、新建/重命名/删除文档的弹窗；
- 底部「新建工作区 / 加入工作区」两个按钮保持原位；
- 去掉 `bg-bg-sidebar` 实底，由外壳卡片提供背景；
- 组件不接收 `sidebarCollapsed` / `onSidebarResizeStart` 等布局 props——折叠与拖拽改由 `App.tsx` 的外壳负责。

**注意**：这些浮层目前都是 `position: fixed`，依赖「卡片不创建 stacking context」这一点（见 `docs/prompt-workspace-shell-and-glass.md`）。搬动 JSX 时不得给新组件加 `transform` / `filter` / `backdrop-filter` / `isolation`，否则 `fixed` 浮层会被画到下一张卡片下面。

### 任务 3：`App.tsx` 外壳合并

- 左卡片列表区条件改为「非 canvas」，内容按视图选择：`note → Sidebar`、`todo → TodoSidebar`、`workspace → 已登录 ? WorkspaceSidebar : null`。
- 左侧 sash 去掉 workspace 特判，workspace 也走 `SidebarResizeHandle variant="gutter"` + `handleSidebarPointerDown("workspace")`；mid-drag 折叠保护（`resizingSidebarState === "workspace"` 时仍渲染 sash）与 note 一致。
- 删除传给 `WorkspaceView` 的四个侧栏 props，只保留 `onOpenAuth`。
- 未登录时左卡片只渲染 rail。

### 任务 4：`Layout/shellLayout.ts` 简化

`leftSidebarOffset(kind, metrics)` 的 workspace 分支（`editorLeft + 2.5`）失去理由，合并为单一公式 `pad + ACTIVITY_BAR_WIDTH + gutter / 2`；删掉 `kind` 参数与所有调用点的传参。

**强制回归**：note 的侧栏拖拽边界（240 / 400 / 180 三个数值）必须与改动前**完全一致**——公式不能变，只允许删掉一条不再使用的分支。

### 任务 5：`Workspace/WorkspaceStrip.tsx`

新建 36px 条带，复用 `Layout/ShellStrip.tsx`：

- 已打开文档：文档名 + 发布状态徽标 + 协作状态（在线人数）+ 右侧 `⋯`（重命名 / 删除 / 权限 / 发布等入口可后置，先保留原有入口）。
- 未打开文档：**工作区名 + 文档数**，不带操作按钮。
- 未登录：不渲染条带（编辑卡片直接是登录卡）。

### 任务 6：`CloudNoteEditor` 头部降级

- 根节点去掉 `bg-bg-primary`，改为与卡片齐平。
- 1384 行的富头部拆成**工具栏行**（`px-5 pt-3 pb-1`，与 `NoteEditor` 的工具栏同构）：视图切换、高亮、滚动同步、权限下拉、发布按钮。
- 文档名从编辑器里移走（由条带承担）；若保留 `更名` 能力，只能通过条带的 `⋯`。
- 标题的本地草稿、脏标记、防抖保存逻辑必须完整保留，只是触发点变了。

### 任务 7：清理 `index.css`

删除 `.app-has-custom-background .workspace-surface`、`.app-work-area-overlay` 两条背景覆盖（齐平后不需要）；`.workspace-editor-surface` 的覆盖确认无引用后再删。
自定义背景开启时，工作台不应再出现一块不透明板。

## 2B｜画布（2A 验收通过后再做）

`CanvasView` 没有侧栏，唯一可进左卡片的是现在浮在卡片里的**画布列表浮层**（约 2247–2360 行）。

- 抽出 `Canvas/CanvasSidebar.tsx`：画布列表、新建、重命名、删除，行语言对齐 `NoteTree`（`h-8` / `text-[13px]` / `rounded-lg` / `flat-active-row`）。
- `App.tsx` 左卡片条件去掉 canvas 例外。
- `CanvasView` 根节点去掉 `bg-bg-primary`；`h-11` 工具栏拆成 36px 条带（画布名 + 当前工具）+ 工具栏行。
- 若 2B 期间发现列表逻辑与画布状态耦合过深，**允许只做「编辑卡片统一」并把列表迁移留到下一轮**，但必须在提交说明里写明。

## 验收清单

1. 三个视图左卡片结构一致：rail + 细线 + 列表；画布在 2B 完成后同样如此。
2. note 侧栏拖拽的 collapse 阈值与宽度上限数值不变。
3. 工作台 240px / 400px 两个宽度下，文档列表、筛选、`⋯` 菜单、详情浮层都完整可见、不被裁切。
4. 未登录进入工作台：左卡片只有 rail，编辑卡片是登录卡。
5. 玻璃拟态开启时，工作台编辑区不是一块不透明板；卡片顶部横线与 note 的标签栏共线。
6. 工作台条带在「有文档 / 无文档」两种状态下高度都是 36px。
7. `npx tsc --noEmit` 与 `npm run build`（PowerShell）都通过。

## 硬性约束

- 不新增依赖、不改 Supabase schema、不动 note 页。
- 中文注释只解释"为什么"。
- `WorkspaceView.tsx` 约 1900 行，抽取顺序必须是：**先建 store → 再抽组件 → 最后合并外壳**，每一步都保证 `tsc` 通过，不要一次性大改。
- 不得让新组件创建 stacking context（见任务 2 的注意）。
