# 提示词：工作台（Dashboard）风格统一与概览面板

> 本文是可直接投喂给编码助手的执行提示词。它**派生自** `docs/decisions-workspace-dashboard.md`，
> 两者冲突时以决策记录为准，并回写修正本文。
> 目标读者：编码助手（执行）+ 项目所有者（复核）。执行者不需要此前对话的上下文，本文自包含。
> 基线：`note` 与 `todo` 两个视图已完成风格统一，工作台是最后一个未对齐的视图。

---

## 一、任务目标

把工作台视图（`workspace`）从「能用」拉到与 note / todo 同一水位，并补一个真正的概览首页。

**具体三件事：**

1. **统一**：配色、字号、圆角、空态、前景 token、条带高度，全部对齐 note / todo 已确立的规则。
2. **补齐层级**：进工作台默认落在「概览」，而不是直接被塞进第一篇文档。
3. **修真实缺陷**：5 处主题色块白字（其中 3 处是黄底白字，对比度不达标）——这是可用性缺陷，不是审美偏好。

**交付判定（全部满足才算完成）：**

- `npm run verify:ui-polish` 全绿，且 `text-white` 登记清单里工作台只剩 `CloudNoteEditor` 的 2 处运行时头像底色。
- 四套主题（blue / dark / yellow / green）下 `bg-warning` 上的文字对比度 ≥ 4.5:1，由 `verify-contrast` 实测。
- 进工作台 → 看到概览；点文档 → 进编辑器；点条带工作台名 → 回概览；删除当前文档 → 回概览。
- 空工作台、有工作台无文档、有文档未选中、选中文档，四种状态互不串味，且都不出现裸的一行灰字。
- 不改数据结构、不加网络请求、不改右侧 AI 侧栏。

---

## 二、背景与现状

### 2.1 涉及文件

| 文件 | 行数 | 角色 |
| --- | --- | --- |
| `src/components/Workspace/WorkspaceView.tsx` | 1136 | 主卡：四种状态 + 四个弹窗 |
| `src/components/Workspace/WorkspaceSidebar.tsx` | 772 | 左栏 explorer（工作台切换、文档列表、筛选、右键菜单、详情浮层） |
| `src/components/Workspace/WorkspaceStrip.tsx` | 287 | 36px 条带（已是 `ShellStrip`，基本合规） |
| `src/components/Workspace/CloudNoteEditor.tsx` | 1706 | 协作正文（本轮只改视觉与密度） |
| `src/stores/workspaceStore.ts` | — | `loadDocuments` / `deleteDocument` 的自动选中逻辑，本轮要改 |
| `src/index.css` | ~1800 | `@theme` 与四套主题变量 |

### 2.2 当前主卡的四种状态（`WorkspaceView.tsx:474-595`）

| 状态 | 判定 | 现状 |
| --- | --- | --- |
| 未登录 | `!user` | 居中登录卡，**本轮不动** |
| 无工作台 | `workspaces.length === 0` | 居中空态 + 两个 `flat-create-trigger` 卡（创建/加入） |
| 选中文档 | `activeDocument && activeWorkspace` | `CloudNoteEditor` |
| 有工作台无选中 | `activeWorkspace` | 居中空态 + 新建文档卡（`WorkspaceView.tsx:565-595`） |

**关键事实**：`workspaceStore.loadDocuments`（`workspaceStore.ts:170-174`）会把 `documents[0]`
自动设为 `activeDocumentId`，`deleteDocument`（`workspaceStore.ts:420-423`）同理。
所以只要工作台里有一篇文档，用户**永远**看不到「有工作台无选中」这一态 —— 概览页必须先改掉这两处才能存在。

### 2.3 已经就绪、不要重建的东西

- **数据**：`loadWorkspaces` / `selectWorkspace` 已同时拉 `documents` 与 `members`
  （`workspaceStore.ts:136-139`、`157-160`）。概览所需的一切都在内存里，**零新增请求**。
- **字段**：`WorkspaceDocument` 有 `updatedAt` / `publicationStatus` / `scheduledPublishAt` / `accessLevel`；
  `Workspace` 有 `inviteCode` / `role`；`WorkspaceMember` 有 `displayName` / `avatarUrl` / `role`。
- **组件**：`Layout/EmptyState.tsx`（图标 + `brand-face` 标题 + 说明 + 可选 action，**全站唯一空态**）、
  `Layout/ShellStrip.tsx`（36px 条带）、`UserAvatar`、`Workspace/workspaceLabels.ts`
  （`roleLabel` / `publicationStatusLabel` / `formatDocumentDate`）。
- **弹窗**：新建/加入、管理、删除、转让确认都已在 `WorkspaceView` 内实现，用局部 state
  （`dialog`、`manageOpen`、`manageSection`）打开。**不要为此新增 store 字段**，概览面板通过 props 回调触发即可。

### 2.4 视觉不变量（违反即返工）

- 顶栏 `h-9`、卡片圆角 `BOX_RADIUS = 10`、gutter / pad / top-gap 全部 6px 且只在
  `Layout/shellLayout.ts` —— **本轮一行都不改**。
- 磨砂只在 `.surface-glass::before`；**卡片元素本身禁止** `filter` / `backdrop-filter` / `transform` /
  `isolation`，否则 `position: fixed` 的菜单与弹窗会被裁进卡片。工作台侧栏的菜单已经 portal 到
  `document.body`，保持这个做法。
- 主题色块上的文字一律 `text-on-accent / success / danger / warning`，**禁止 `text-white`**。
- 动效只能用 `--ease-*` / `--dur-*`，手写 `cubic-bezier` 会被审计判失败。
- `scrollbar-width` 必须留在 `@supports not selector(::-webkit-scrollbar)` 内。

---

## 三、批次

### B0 · 基础设施（先做，否则后面每处都缺 token）

**B0-1 新增 `--color-on-warning`**

`src/index.css`：

1. `@theme { }` 块内、`--color-on-danger` 之后加 `--color-on-warning: #3d2c00;`（实测值以对比度为准）。
2. `.theme-blue` / `.theme-dark` / `.theme-yellow` / `.theme-green` **四块各写一次**覆盖。
   注意 dark 的 `--color-warning` 是 `#fcc419`，同样是亮底，仍然需要**深色**字，
   不要照抄 `--color-on-accent` 的深色值就完事 —— 逐个主题算对比度。

**B0-2 审计脚本跟上**

- `scripts/verify-contrast.mjs:73`：把循环的 `["accent", "success", "danger"]` 加上 `"warning"`。
  `variants` 只保留实心 `bg-warning`（`bg-warning/10` 只做悬停底色，无文字）。
- `scripts/verify-ui-polish.mjs`：
  - `P0-1a` 的 `["accent","success","danger"]` 加 `"warning"`；`P0-1b` 同理（四主题各覆盖）。
  - `P0-1c` 的 `allowed` 清单**删掉** `WorkspaceSidebar.tsx: 2` 与 `WorkspaceView.tsx: 1` 两条；
    `CloudNoteEditor.tsx: 2` **保留**（那是 `style={{ backgroundColor: user.color }}` 的运行时底色，
    不属于主题色块）。不删这两条，改完反而审计失败。

**B0-3 i18n 键**

`src/utils/i18n.ts` 的 `TranslationKeys` + `zh`（约 743 行起）+ `en`（约 1486 行起）三处同步新增。
**先 grep 已有键**（`inviteCode`、`workspaceMembers`、`cloudDocumentDraft`、`cloudDocumentScheduled`、
`cloudDocumentPublished`、`newCloudDocument`、`createWorkspace`、`joinWorkspace` 都已存在），只补缺的：

| key | zh | en |
| --- | --- | --- |
| `workspaceOverview` | 概览 | Overview |
| `overviewDocuments` | 文档 | Documents |
| `overviewMembers` | 成员 | Members |
| `overviewRecent` | 最近编辑 | Recently edited |
| `overviewRecentEmpty` | 还没有可显示的编辑记录 | Nothing edited yet |
| `overviewRecentEmptyHint` | 新建一篇云文档，它会出现在这里 | Create a cloud document and it will show up here |
| `overviewOwnerTools` | 工作台管理 | Workspace admin |
| `overviewInviteCode` | 邀请码 | Invite code |
| `overviewCopyInvite` | 复制邀请码 | Copy invite code |
| `overviewCopied` | 已复制 | Copied |
| `overviewPendingPublish` | 待发布 | To publish |
| `overviewBackToOverview` | 返回概览 | Back to overview |
| `overviewNoWorkspaceTitle` | 还没有工作台 | No workspace yet |
| `overviewNoWorkspaceHint` | 创建一个工作台，或用邀请码加入一个 | Create one, or join with an invite code |
| `overviewReadOnlyHint` | 你在当前工作台中是阅读者，可以浏览但不能新建文档 | You are a viewer here: browsing only |
| `overviewUpdatedAt` | 最近更新 | Updated |

**验收**：`npx tsc --noEmit` 通过；`node scripts/verify-contrast.mjs` 四主题 warning 行全 pass。

---

### B1 · store 行为：进工作台不再自动进文档

**改动点（只有三处，别扩散）：**

1. `workspaceStore.ts:170-174`（`loadDocuments`）：不再 `activeDocumentId: nextId`。
   只在「当前 `activeDocumentId` 仍存在于新列表」时保留，否则置 `null`。
2. `workspaceStore.ts:420-423`（`deleteDocument`）：删的是当前文档时置 `null`（回概览），
   不是 `documents[0]?.id ?? null`。
3. `selectDocument` 签名放宽为 `(documentId: string | null) => void`，store 接口与实现同步。
   调用点 `WorkspaceSidebar` 传具体 id 不受影响；新增「回概览」用 `selectDocument(null)`。

**必须一起处理的连带影响：**

- `WorkspaceStrip` 的「无 activeDocument」分支已经存在（`WorkspaceStrip.tsx:273-281`，显示工作台名 +
  文档数），语义正好是概览态，直接复用，不要另写一套。
- 新建文档成功后要**停留**在编辑器（现有逻辑会 `selectDocument(newId)`，确认没被 B1 打断）。
- `CloudNoteEditor` 只在 `activeDocument` 存在时挂载，回概览即卸载。**不要**为了「保活」把它隐藏渲染 ——
  Yjs provider 会继续占用连接。

**验收**：刷新 → 概览；点文档 → 编辑器；删除当前文档 → 概览；删除非当前文档 → 停留不动。

---

### B2 · 概览面板（新文件 `src/components/Workspace/WorkspaceOverview.tsx`）

**props（够用即可，不要预留没用的）：**

```ts
interface WorkspaceOverviewProps {
  onCreateDocument: () => void;
  onCreateWorkspace: () => void;
  onJoinWorkspace: () => void;
  onOpenManage: (section: "permissions" | "settings") => void;
}
```

数据全部用 `useWorkspaceStore` 的选择器取；**禁止**在组件内发请求。

**布局（桌面宽度下的层级，从松到紧）：**

```
┌ 概览标题行：品牌字工作台名（brand-face, 18-20px）+ 角色徽标 + 右侧「管理」按钮(owner)
├ 统计区：4 张等宽卡（文档 / 草稿 / 定时 / 已发布）——数字 tabular-nums 24px，标签 12px
├ 最近编辑：区块标题 + 最多 5 行（标题 / 发布状态点 / 更新日期），点击进编辑器
└ owner 专属：邀请码 + 复制 + 「权限管理」「工作台设置」两个入口 + 待发布提醒
```

- 栅格用 `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`，并给容器加 `@container` 式自适应：
  编辑器卡宽度是可拖拽的，**窄到 480px 以下必须塌成单列**，不允许横向溢出。
- 最近编辑按 `updatedAt` 倒序 `slice(0, 5)`。
- 时间用 `formatDocumentDate` 或 `toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")`，与侧栏一致。
- 统计卡不是按钮就不要 hover 态，不要做成「看起来能点」。

**四种状态（**逐条实现，这是本轮最容易漏的部分**）：**

| 状态 | 概览面板内容 |
| --- | --- |
| 已登录、无工作台 | **概览框架照常渲染**（标题用「工作台」），内容区换成一块内嵌引导：`EmptyState` 风格的说明 + 创建/加入两个 `flat-create-trigger` 卡。**不要**再回到旧的居中裸空态（`WorkspaceView.tsx:513-546` 整段可删）。 |
| 有工作台、0 文档 | 统计全 0；最近编辑换成 `EmptyState`（见 B2-1）；owner 区照常；`canEdit` 时给「新建云文档」主按钮。 |
| 有工作台、有文档 | 完整四块。 |
| 只读（`role === "viewer"`） | 隐藏 owner 区与所有新建入口，顶部显示 `overviewReadOnlyHint` 一行（12px，`text-text-muted`，不做成警示条）。 |

**B2-1 最近编辑为空时的降级（本轮明确要修的「问题」）**

不要出现「最近编辑」标题 + 一片空白。规则：

- 列表为空 → 整块换成 `EmptyState`：`icon={FilePlus2}`、`title={overviewRecentEmpty}`、
  `description={overviewRecentEmptyHint}`；`canEdit` 时带 `action={{ label: newCloudDocument, onClick: onCreateDocument }}`，
  viewer 不带 action（否则按钮点了没权限，是假入口）。
- 同时把「待发布」统计卡做成可读的呼应：数 > 0 时标签旁加一个 6px 圆点（`bg-warning`），
  让「有草稿没发布」这件事在概览上有一条完整的叙事，而不是靠一句空文案。

**B2-2 挂载**

`WorkspaceView.tsx` 的 `activeWorkspace` 分支（565-595 行）替换为 `<WorkspaceOverview ... />`。
「无工作台」分支（513-546 行）同样渲染概览面板，只是内部走第一态。
**注意**：`WorkspaceOverview` 需要 `activeWorkspace` 可能为 `null`，所有读 `activeWorkspace.xxx` 的地方要防空。

---

### B3 · 左栏（`WorkspaceSidebar.tsx`）只调视觉密度

**控件位置一个都不动**，只做这四类改动：

1. **前景 token**：`WorkspaceSidebar.tsx:370`、`507` 的 `bg-warning text-white` → `bg-warning text-on-warning`。
   同文件 `:364`、`:510` 的 `bg-text-muted text-bg-primary` 保留（那是反白，合规）。
2. **字号**：
   - `text-[10px]` → `text-[11px]`（仅 `:406` 分组小标题、`:410` 角色徽标、`:485` 筛选 chip 这类纯标注）。
   - 正文性质的 `text-[11px]` → `text-xs`（12px），例如 `:388` 的工作台计数量、`:455` 新建文档副标题。
   - 大写字距标题（`tracking-[0.12em]`）保留，但它下面到列表的间距统一成 8px。
3. **空态**：`filteredDocuments.length === 0` 时现在什么都不显示 →
   - 有筛选条件：`EmptyState`（icon 用 `Filter`/`FileText`，标题「没有匹配的文档」，无 action）。
   - 无筛选条件（真的没有文档）：`EmptyState`（`FilePlus2` + 「工作台还没有文档」，`canEdit` 时 action 新建）。
4. **节奏**：`px-3` / `px-2` 混用收敛为「分组内 `px-2`、分组容器 `px-3`」；卡片间垂直间距统一 8px，
   不要出现 6px 与 10px 交替。

**不要动**：工作台下拉、权限按钮、右键菜单、详情浮层、拖拽重排逻辑、portal 目标。

---

### B4 · 条带（`WorkspaceStrip.tsx`）

只加一处能力：**无选中文档时，工作台名变成「回概览」入口**。

- 用 `<button type="button" onClick={() => selectDocument(null)}>` 包住那段名字，
  `title={t(lang, "overviewBackToOverview")}`，`aria-label` 同名。
- 有选中文档时名字是纯文本（现有行为），因为它已经在编辑器里，不需要「回概览」伪装成标题。
- 悬停态：`hover:text-accent`，不加背景块（条带上出现背景块会和 note 的 tab 抢视觉）。
- 高度 `h-9`、单条 `border-b`、`ShellStrip` 结构全部不动。

---

### B5 · 正文编辑器（`CloudNoteEditor.tsx`）只统一视觉与密度

**明确不做**：正文 `max-w-[820px]`、行高 `leading-[1.7]`、标题层级、CodeMirror 配置、分栏比例、
协作逻辑、网络浮层的数据与图表。

**要做：**

1. **工具栏对齐**（`:1306`）：`px-5 pb-1 pt-3` 与 note 编辑器的工具条对齐成同一高度节奏
   （note 侧先看一眼，以它为准）；按钮统一 `h-7 w-7` 或 `h-8 w-8`（**同一个工具栏内只有一种尺寸**，
   现在是混着的）。
2. **右侧状态区收纳**（`:1339-1496`）：现在是 `权限 dropdown | 发布按钮 | · | 网络 | · | 保存 | · | 在线`
   —— 三个手打的 `·` 分隔符 + 七个元素平铺，窄卡会 `flex-wrap` 硬折行。改成两组：
   - 组 1「文档态」：权限 dropdown + 发布按钮。
   - 组 2「协作态」：在线头像堆叠 + 网络状态点（保存态收进网络浮层或紧随其后，用颜色区分即可）。
   - 两组之间用 `<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />` 分隔，
     **删掉全部 `·`**；容器 `flex-nowrap` + `overflow-hidden`，组 2 在窄卡下只留图标与数字，
     文字用 `hidden xl:inline` 之类的容器查询降级（不要用视口媒体查询）。
3. **头像白字保留**：`:1454`、`:1480` 的 `text-white` 是 `backgroundColor: user.color` 的运行时底色，
   审计已登记，**不要改**（改成 `text-on-accent` 会在浅色头像上白给）。
4. **弹窗与提示卡**：
   - `:1553` 发布弹窗已是 `rounded-xl`，检查它与 `WorkspaceView` 的四个弹窗**同一套**头部结构
     （图标块 + 标题 + 关闭按钮 + `border-b` + `bg-bg-sidebar/45`）。
   - `:1133` 的「协作未配置」提示卡（`rounded-xl border bg-bg-secondary/45`）换成 `EmptyState`，
     `icon={CircleAlert}`，保留 warning 语义。
5. **字号**：`:1358`、`:1369` 等处的 `text-[11px]` → `text-xs`；`:1392`、`:1416`、`:1426` 这类
   浮层内的纯标注可留 11px，但浮层标题要从 11px 提到 12px。

---

### B6 · 四个弹窗（`WorkspaceView.tsx`）

1. **圆角归位**：`:650` 的 `rounded-[22px]` → `rounded-xl`（全站唯一例外，必须消灭）。
2. **头部统一**：四个弹窗（新建/加入、管理、删除确认、转让确认）共用
   `flex items-center gap-2.5 border-b border-border bg-bg-sidebar/45 px-4 py-3` +
   8×8 图标块 + `text-sm font-semibold` 标题 + 关闭按钮，逐个核对，不要一个用 `items-start` 一个用
   `items-center`。
3. **危险动作**：`:1006` 的 `bg-warning text-white` → `text-on-warning`（这是「转让创建者」，
   warning 语义正确，别改成 danger）。删除类按钮统一 `text-on-danger`。
4. **按钮尺寸**：底部按钮现在是 `h-8` 与 `h-9` 混用，同一弹窗内统一 `h-8`（`EmptyState` 的 action
   是 `h-9`，那是页面级主按钮，两套可以并存，但同一个弹窗内不许混）。

---

## 四、验收

```bash
# 类型（PowerShell 策略可能挡 npx，直接走 node）
node node_modules/typescript/bin/tsc --noEmit

# 静态审计 + 四主题对比度实测
npm run verify:ui-polish
```

**静态预览（本机无 GUI，必须做）**：仿 `scripts/gen-ai-preview.mjs` 写
`scripts/gen-workspace-preview.mjs`，把**真实 `index.css`** 内联进去，输出四个快照到
`.workbuddy/preview/`：`workspace-overview.html`（完整概览）、`workspace-empty.html`（无工作台）、
`workspace-readonly.html`（viewer）、`workspace-sidebar.html`（左栏 + 筛选无结果空态）。
每个快照浅/深两套主题并排。生成后用无头 Chrome 截图自查，**截图里逐项核对**：

- [ ] 概览统计卡在 480px 宽下塌成单列，无横向滚动
- [ ] `bg-warning` 上的字是深色，肉眼可读
- [ ] 最近编辑为空时是 `EmptyState`，不是标题 + 空白
- [ ] viewer 状态下没有任何新建入口
- [ ] 左栏筛选 chip 选中态与 note 的选中态同一视觉语言

**必须交给项目所有者真机确认的（本机无法验证，交付时如实列出，不要声称已验证）：**

- 悬停浮层（网络历史、在线成员）与右键菜单的定位与遮挡
- 拖拽重排文档
- Yjs 协作连接、断线重连、`CloudNoteEditor` 卸载后连接是否释放
- 150% 显示缩放下的实际读数（此前有过 CSS px 与设备 px 混淆的先例）
- 侧栏拖拽时概览的容器查询是否实时跟随（容器宽度变化 → 栅格塌缩）

---

## 五、风险与回滚

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| B1 改自动选中后，某处代码隐式依赖「总有一篇 activeDocument」 | 空白主卡 / 空指针 | 全仓 grep `activeDocumentId` 与 `activeDocument`，逐个确认能接受 `null`；`WorkspaceStrip` 已有 null 分支 |
| 概览面板读 `activeWorkspace.xxx` 未防空 | 无工作台时崩溃 | 状态矩阵第一态强制走早返回 |
| 新增 `on-warning` 影响既有配色 | 13 组对比度回归 | `verify-contrast` 全量跑，不只盯 warning 行 |
| 窄卡状态区 `flex-nowrap` 溢出 | 工具栏被裁 | 组 2 必须能在容器查询下退化为图标，配 `min-w-0 truncate` |
| 概览做成「卡片瀑布」 | 与 note/todo 的克制风格冲突 | 统计卡无阴影、无渐变，只用 `border-border` + `bg-bg-secondary/40` |

回滚：改动集中在 5 个文件 + 2 个脚本 + `index.css`，按批次提交，B1 与 B2 可独立回退
（回退 B1 时概览仍在，只是需要手动清空选中才能看到）。

---

## 六、不要做的事

1. 不要改 `shellLayout.ts`、`ShellStrip` 结构、卡片圆角与间距。
2. 不要为概览新增 store 字段或网络请求。
3. 不要引入新依赖（`motion` / `lucide-react` / Tailwind 已够）。
4. 不要给概览加插图、渐变大色块或玻璃卡片 —— 它与 todo 的横线本、note 的纸纹是同一套语言，
   靠**留白与字号对比**建立层级，不靠装饰。
5. 不要把 `text-white` 批量替换成 `text-on-accent`：运行时的 `user.color` 头像必须保留白字。
6. 不要动右侧 AI 侧栏、顶栏、ActivityBar。
7. 不要在概览里放「最近加入的成员」「活动时间线」这类需要新数据的功能。

---

## 七、实施回写（2026-10-24，第二轮）

第一轮执行时把三处「提示词自相矛盾」的地方做了偏离并在决策文档里说明；第二轮已全部按提示词回正，
实现方式如下，后续复用本文件时以本节为准：

1. **B2 的栅格**：恢复 `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`，另加
   `@container workspace-overview (max-width: 479px)` 的单列护栏（unlayered，直接压过工具类）。
   这样既保留提示词的视口断点，又保证「480px 以下单列」这条硬约束。
2. **B5-2 的 `overflow-hidden`**：确实加在工具栏上了。代价是浮层不能再放在行内，于是网络历史与
   在线成员改走 portal（`Workspace/HoverPopover.tsx`），仍是 hover / focus 打开，关闭延迟 140ms 以
   跨越 6px 间隙，滚动与缩放时重新定位。
3. **B5-2 的保存态**：改回「紧随其后 + 按状态上色」的文字，不再用「圆点 + 被裁文字」。

第一轮遗留、第二轮补做的部分：左栏结构重做（与 note / todo 同一骨架）、行菜单改为右键、管理工作台
弹窗内部重做、网络浮层数字与图例口径统一。细节见决策记录「第二轮（同日）」一节。
