# 决策记录：待办与云端工作台布局对齐笔记页

日期：2026-10-23
状态：部分实施（todo 已落地，workspace 待做）

## 背景

笔记页（note）已经完成三卡片外壳 + 玻璃拟态的改造：左卡片是「rail + 细线 +  Explorer」，编辑卡片是 `NoteTabBar`(36px) + 编辑器，内容与卡片齐平。待办页与云端工作台页仍保留改造前的结构：

- 待办：左卡片已经复用笔记页外壳，但编辑卡片里自带大标题头（图标块 + h1 + 进度卡）、独立输入区和独立筛选胶囊，再套一层内框。
- 工作台：左卡片只有 rail，侧栏 `aside` 长在编辑卡片内部，自带 `bg-bg-sidebar` 实底与自己的拖拽把手；编辑卡片的云端文档还有一个 `py-2` 可换行的富头部。

目标：让三个页面的左卡片与编辑卡片在骨架层面同构，视觉语言统一到笔记页。

## 已确认的前提

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 仿制层级 | 骨架 + 信息架构，不做标签页语义 | 列表/文档的多开标签需要第二套 tab 状态、脏标记与关闭策略，成本远超布局重制；笔记标签栏的存在前提是笔记天然多开，清单与文档不是同一回事 |
| todo 顶部条带 | 清单名 + 统计（含进度条）+ 状态筛选胶囊 + 优先级筛选 + 新建按钮 | 这五项是清单页高频操作，收进菜单会让常用操作多一次点击；笔记条带只有标签，是因为它的操作全在编辑器工具栏里 |
| todo 新建 | 条带右侧按钮聚焦下方常驻录入行，输入框不进 36px 条带 | 36px 内放输入框会挤掉筛选；常驻录入行让「输入 → Enter → 再输入」不额外花一次点击 |
| 工作台侧栏位置 | 搬进左卡片，与 note / todo 同构 | 这是三个页面最根本的差异；只换皮会让 `App.tsx` 里 `currentView === "workspace"` 的特判永久留存 |
| 未登录态 | 左卡片只留 rail，编辑卡片给登录卡 | 没有可列数据时，空侧栏只是占宽度的死区 |
| 工作台头部 | 两层：36px 条带（文档名 + 发布/协作状态 + ⋯）+ 编辑器工具栏行（视图切换、高亮、滚动同步、权限、发布） | 现有富头部塞不进 36px，硬压会在窄窗口截断；两层结构是笔记页已验证过的分工——条带负责「这是哪个对象」，工具栏负责「怎么编辑」 |
| 侧栏宽度与折叠 | 三个页面共用一条渲染路径，但**各自记忆宽度**（`--notebook-sidebar-width` 给 note/todo，`--workspace-sidebar-width` 给 workspace） | 用户希望工作台侧栏可以比笔记树更宽；共用路径保证行为一致，独立变量保留各自的拖动结果 |
| 侧栏 UI 状态 | 新建 `workspaceUiStore`，只放弹窗等瞬时状态 | 数据在 `workspaceStore`（Supabase 缓存），`WorkspaceView` 用 `useWorkspaceStore()` 无选择器整体解构，把弹窗开关塞进数据 store 会让每次开关弹窗重渲染整个视图 |

## 视觉规范

| 部位 | 处理 |
| --- | --- |
| 条带骨架 | 统一 `ShellStrip`：`h-9` + 单条 `border-b`，左/中/右三段；与 `NoteTabBar` 同高，三卡片的横线落在同一水平线上 |
| 条带可选组 | 条带自身是 CSS 容器（`container-name: shell-strip`），宽度 < 620px 时 `.shell-strip__optional` 隐藏（容器查询，不用视口媒体查询——左卡片可拖拽，视口宽度看不出卡片宽度） |
| 待办录入行 | 无外框，`px-3` + `h-7` 控件，与笔记编辑器工具栏同一质感 |
| 待办任务行 | 去掉 `bg-bg-primary/75` 与边框，改 `rounded-lg` + `hover:bg-bg-hover`；完成态 `opacity-60`；子待办缩进对齐勾选框列（`ml-[60px]`） |
| 待办清单行 | 对齐 `NoteTree` 行语言：`h-8`、`text-[13px]`、`rounded-lg`，选中用 `flat-active-row`，图标不再套 24px 色块 |
| 侧栏头部 | 三个左卡片统一 `h-9` + `border-b` + `text-[11px] uppercase tracking-[0.08em]` 标题 |

## 第二阶段已定的补充结论（2026-10-23）

| 项 | 结论 |
| --- | --- |
| 工作台空态条带 | 未打开文档时显示「工作区名 + 文档数」，不带操作按钮 |
| 富头部里的权限 / 发布 | 随视图切换、高亮、滚动同步一起下移到编辑器工具栏行，条带只留「这是哪篇文档 + 发布/协作状态 + ⋯」 |
| 画布 | 一并统一：编辑卡片去实底、`h-11` 工具栏拆成 36px 条带 + 工具栏行；画布列表浮层搬进左卡片（拆成 2B，可与工作台分开验收） |

详细实施提示词见 `docs/prompt-workspace-layout-round1.md`。

## 已解决的历史条目

1. 工作台条带空态 → 已定（见上表）。
2. `index.css` 里 `.workspace-surface` / `.app-work-area-overlay` 的自定义背景覆盖 → 列入第二阶段任务 7 一并清理。

## 追加：todo 条带收编全部新建入口（2026-10-23 第二轮）

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 添加新任务 | 条带中部内联输入框（`h-7`，flex-1），删掉条带下方的常驻录入行 | 条带是唯一常驻不滚动的行；录入行搬进去后卡片少一层 |
| 新建清单 | 条带右侧图标按钮 + 下方浮层输入名称 | 侧栏顶部就地展开会把清单列表往下顶；浮层不改变已有布局 |
| 侧栏清单可展开 | 展开后列任务（圆点可勾选）与子任务（小方块，缩进），点任务标题激活该清单 | 只在侧栏里扫一眼待办，不必切主区 |
| 子任务竖线 | `ml-[74px]`，穿过主任务圆圈中心 | 行内几何：`px-2.5` 10 + 拖拽柄 14 + 间隔 10 + 展开位 16 + 间隔 10 + 勾选按钮 28/2 = 74 |
| 子任务标记 | 圆形 → 12px 圆角小方块 | 同一件事的两个层级，形状区分父子，不必靠缩进猜 |

删除的旧元素：条带下方的常驻录入行、侧栏顶部的「新建清单」大卡片（`todo-create-trigger`，其 CSS 一并移除）、
主任务行与侧栏清单行里的 `text-sm` / 边框盒子。

## 追加：主区任务增加待办描述（2026-10-23 第三轮）

前提：侧栏已经能展开看到任务，主区的列表若只重复标题就没有存在价值。因此给主区每个任务补一个
「描述」——它是主区独有的信息，侧栏只用一个 10px 图标提示"这条有描述"。

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 编辑形态 | 点「添加描述」展开内联编辑区，保存/失焦后折叠为只读卡片，点卡片可再进入编辑 | 卡片是默认态，列表不会被一排输入框撑乱 |
| 入口 | 无描述时任务下方常驻一行浅色「＋ 添加描述」 | 用户选定；入口不藏在 hover 里，发现成本为零 |
| 保存 | `Ctrl+Enter` 或「保存」按钮；点击别处（失焦）同样提交；`Esc` 取消 | 丢段落比多存一次更糟 |
| 层级 | 仅主任务；子任务保持单行标题 | 子任务本身就是清单项，写正文会让它和任务混淆 |
| 位置 | 任务行下方、子任务分支上方，左缩进 `ml-[98px]` 对齐标题列 | 描述属于任务本身，子待办属于它下面的清单 |
| 数据 | `Todo.description?: string`，走 `updateTodo` 浅合并写回 | `saveTodos<T>` 是泛型、直接序列化数组，可选字段无需迁移 |
| 清空 | 保存空文本 → 写 `undefined`，卡片退回「＋ 添加描述」 | 与"从未写过"同一状态，不留下空卡片 |

## 实施进度

- 2026-10-23（第一轮）：`ShellStrip`、`TodoStrip` 新建；`TodoView` 去掉大标题头与两张统计卡；`TodoSidebar` 头部改为 `h-9`，清单行对齐 `NoteTree` 行语言。
- 2026-10-23（第二轮）：`TodoStrip` 收编「添加任务输入框 + 优先级标记 + 新建清单浮层」；`TodoView` 删除录入行与相关状态（`newTitle` / `newPriority` / `newTodoInputRef` / 优先级下拉）；子任务竖线改 `ml-[74px]`、标记改小方块；`TodoSidebar` 增加清单展开（`expandedListIds`，仅会话内），展开区含任务勾选与子任务缩进。
- 2026-10-23（第三轮）：`types/index.ts` 加 `Todo.description?`；新建 `TodoDescriptionCard`（三态：浅色入口 / 编辑区 / 只读卡片）；`TodoView` 在任务行下方注入描述区；`TodoSidebar` 展开区对有描述的任务显示 `AlignLeft` 小图标。
- 2026-10-23（第二阶段 2A）：`workspaceUiStore`、`WorkspaceSidebar` 抽出、`App.tsx` 外壳合并、`shellLayout.leftSidebarOffset` 简化、`WorkspaceStrip`、`CloudNoteEditor` 头部降级 —— 详见文末「第二阶段 2A」一节。
- 待做：2B 画布（`CanvasSidebar` + 编辑卡片统一）。

## 追加：第二阶段 2A（工作台）实施记录（2026-10-23）

决策表见 `docs/prompt-workspace-layout-round1.md`，本节只记录落地时新增的判断与偏差点。

| 项 | 落地做法 | 理由 / 偏差 |
| --- | --- | --- |
| `stores/workspaceUi.ts` | 除 `dialog` / `dialogValue` / `dialogNotice` / `renamingDocumentId` 外，另收 `deleteTarget`、`manageOpen` / `manageSection`、`publicationDocumentId`、`onlineCollaborators` | `WorkspaceSidebar` 现在是 `App.tsx` 内的兄弟节点，与 `WorkspaceView` 之间没有 props 通道；这些"哪个浮层开着"的状态只能走 store，否则要加事件总线 |
| 标题重命名 | 编辑器里的内联标题输入删掉；600ms 防抖 + 排队写入 + Esc 还原的草稿机整体搬到 `WorkspaceStrip`，由 `⋯` 菜单的「重命名」触发 | 任务 6 要求"逻辑完整保留、触发点改变"。放在条带里既保留了行为，也满足"只能通过 ⋯ 更名" |
| 在线人数 | `CloudNoteEditor` 把 awareness 人数写进 `workspaceUi`，条带读取 | awareness 是编辑器内部状态，条带是它的兄弟节点 |
| `.app-work-area-overlay` 背景覆盖 | 只删 `.workspace-surface` 与 `.workspace-editor-surface` 两条；`app-work-area-overlay` 暂时保留 | `CanvasView` 仍用该类做壁纸底衬，删掉会让画布在自定义背景下透底；等 2B 一并清理 |
| `workspace-editor-surface` 类名 | 保留在编辑器根节点，只去掉 `bg-bg-primary` | 它同时是 480px 工具栏内边距规则的锚点；背景覆盖已删 |
| 侧栏宽度变量 | 左卡片按视图选择 `--notebook-sidebar-width` / `--workspace-sidebar-width`，折叠态各自记忆 | 渲染路径合并，状态不合并 |
| 收起动画 | 侧栏内容改 `w-full`（原来内层固定 `var(--workspace-sidebar-width)`） | 与 note / todo 一致；动画期间内容随宽度回流，不再被裁切 |

### 2A 完成项

`workspaceUi` store、`WorkspaceSidebar`、`WorkspaceStrip`、`workspaceLabels` 新建；`App.tsx` 左卡片与 sash 合并、
`WorkspaceView` 去掉四个侧栏 props 并降级为编辑卡片外壳；`leftSidebarOffset` 收敛为单一公式；
`CloudNoteEditor` 头部落成工具栏行、根节点去底色；`index.css` 删两条背景覆盖。
`npx tsc --noEmit` 与 `npm run build` 均通过；240 / 400px、未登录、已打开文档、关闭玻璃四种状态经无头 Chrome 截图核对。

### 待做（2B）

`Canvas/CanvasSidebar.tsx`、`App.tsx` 去掉 canvas 例外、`CanvasView` 根节点去底色并把 `h-11` 工具栏拆成 36px 条带 +
工具栏行、删除 `.app-work-area-overlay` 覆盖。

### 修正：左栏宽度与折叠改为全局共用（用户 2026-10-23 定）

原决策 4「渲染路径共用，但各页各自记忆」作废。用户要求工作台左栏与 note / todo **同步**，不再各自一份宽度。

- 落地：删除 `workspaceSidebarWidth` / `workspaceSidebarCollapsed` 与 `--workspace-sidebar-width`，宽度变量改名 `--left-sidebar-width`；`ResizableSidebar`
  收敛为 `"notebook" | "ai"`；左侧 sash 永远按 `notebook` 记账，因此拖拽写的一直是 `--notebook-sidebar-width`。
- 结果：在任何视图里拖宽或收起左栏，切到其它视图后宽度与折叠状态都一致。
- 不变：note 的三个边界数值（240 / 400 / 180）与 `leftSidebarOffset` 公式。
