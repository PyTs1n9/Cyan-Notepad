# 顶部菜单改造方案（工具 / 传送门 / 帮助）

配套决策记录：`docs/decisions-topbar-menus.md`。本文件是可执行方案，含优先级与验收标准。

---

## 0. 结论

顶栏从「三个随上下文变形的下拉菜单」收敛为 **零个通用下拉菜单 + 一个帮助入口**。所有动作先收进
一份带元数据的注册表，再按归属下沉到各视图容器。菜单形态只在帮助入口保留一处，因此不必补齐一整套
Win32 菜单键盘语义，键盘债随之消失。

---

## 1. 目标信息架构

```text
现状                                    目标
─────────────────────────────           ─────────────────────────────
TitleBar                                TitleBar
 ├ 工具    → 视图切换（与 rail 重复）     ├ 拖拽区（居中标题）
 ├ 传送门  → 当前视图动作（20 项）        ├ 帮助 ▾（唯一菜单，4 项）
 ├ 帮助    → 设置/关于/退出              ├ 头像 ▾（登录态/退出登录/退出应用）
 ├ 头像    → 资料卡                      └ 窗口三键
 └ 窗口三键
                                        ActivityBar（唯一视图切换源）
ActivityBar                              ├ 笔记 / 待办 / 协作 / 画布
 ├ 笔记 / 待办 / 协作 / 画布（重复）       ├ 小青 AI
 ├ 小青 / 折叠 / 设置 / 置顶               ├ 折叠
                                         ├ 设置（唯一语义归属）
                                         └ 置顶

各视图 strip（动作归位后承载高频与诊断动作）
 ├ 笔记：笔记树头 ▸ 新建/分类/导入 ；笔记卡片 strip ▸ …（导出/便签）
 ├ 待办：TodoSidebar 头 ▸ 新建清单 ；TodoStrip ▸ 三档筛选（已有）
 ├ 画布：CanvasToolbar（已有，新增项已在其中）
 └ 协作：WorkspaceSidebar 头 ▸ 创建/加入 ；WorkspaceStrip … ▸ 权限/邀请
```

---

## 2. 动作落位表

> ⚠️ **本表为设计期版本，其中「唯一入口」列有误，已在实施后修正。**实测只有**导入笔记**与
> **导出笔记**两项是唯一入口，其余 18 项均有等价入口（协作五项走 `workspaceUi.openDialog`、
> 画布六项走画布工具栏、新建分类走 `Sidebar` 内联重命名）。修正过程与实测入口见
> `docs/decisions-topbar-menus.md` 的 D11。

「唯一入口」列来自逐项反查：凡标 ✔ 者，删除传送门即等于删除该功能。

| 动作 | 现状入口数 | 唯一入口 | 目标容器 |
| --- | --- | --- | --- |
| 新建笔记 | 2（传送门 + 笔记树） | ✘ | 笔记树头部（保留现有） |
| 新建分类 | **1** | ✔ | 笔记树头部 ▸ 与「新建笔记」并列 |
| 导入笔记 | **1** | ✔ | 笔记树头部 ▸ `…` 菜单 |
| 导出笔记 | **1** | ✔ | 笔记卡片 strip ▸ `…` 菜单 |
| 置顶便签 | 2（传送门 + 编辑器） | ✘ | 编辑器工具栏（保留现有） |
| 新建待办清单 | 2（传送门 + TodoSidebar） | ✘ | TodoSidebar 头部（保留现有） |
| 待办筛选 ×3 | 2（传送门 + TodoStrip） | ✘ | TodoStrip（保留现有） |
| 画布新建/图片/文字/适配/磁贴/导出 | 2（传送门 + CanvasToolbar） | ✘ | CanvasToolbar（保留现有） |
| 创建协作空间 | **1** | ✔ | WorkspaceSidebar 头部 |
| 加入协作空间 | **1** | ✔ | WorkspaceSidebar 头部 |
| 新建云文档 | **1** | ✔ | WorkspaceSidebar 头部（按 role 启用） |
| 权限管理 | **1** | ✔ | WorkspaceStrip `…` 菜单（已有菜单容器） |
| 复制邀请 | **1** | ✔ | WorkspaceStrip `…` 菜单 |

**结论**：传送门 20 个按钮中 **12 个是重复入口可直接删**，**8 个是唯一入口必须迁移**。这也是
「传送门看起来冗余、实为关键路径」的原因。

---

## 3. 动作注册表（可维护性的根）

现状问题是动作以 JSX 硬编码，于是快捷键、搜索、禁用原因、pending 态全都无处可挂。改造引入单一
数据源，菜单与 strip 都只是它的渲染器。

```ts
// src/components/Layout/menuActions.ts
export type ActionScope = "global" | "note" | "todo" | "canvas" | "workspace";

export interface AppAction {
  id: string;                  // 全局唯一，同时作为 i18n key 后缀
  label: string;               // 已本地化文本
  icon: LucideIcon;
  scope: ActionScope;          // 归属视图；global 恒可用
  shortcut?: string;           // 加速键文案，如 "Ctrl+Shift+E"
  enabled: () => boolean;
  disabledReason?: () => string; // 必须给出人话，而不是"不可用"
  pending?: () => boolean;       // 异步动作的进行中态
  run: () => void | Promise<void>;
}
```

收益（都是现状缺的）：禁用原因、pending、快捷键一览、命令面板（未来）、菜单与 strip 行为一致、
单测可覆盖 `enabled()` 的组合。

---

## 4. 组件处置清单

| 组件 / 代码块 | 处置 | 说明 |
| --- | --- | --- |
| `TitleBar` 工具菜单块（`L274-317`） | **删除** | 与 ActivityBar 重复 |
| `TitleBar` 传送门块（`L320-410`） | **删除** | 动作按 §2 下沉 |
| `PortalActionButton`（`L50-78`） | **迁移** | 改为通用 `ActionButton`，供 strip 复用 |
| `portalViewMeta`（`L250-257`） | **删除** | 只为传送门标题服务 |
| `TitleBar` 帮助菜单块（`L413-441`） | **重写** | 收为图标菜单，见 §5 |
| 「新建分类」内联对话框（`L523-571`） | **迁出** | 提到 `Layout/NewCategoryDialog.tsx` |
| 「资料卡」内联弹窗（`L573-633`） | **迁出** | 提到 `Layout/ProfilePopover.tsx`，承接退出应用 |
| 三个 `invoke` 无 catch（`L167-174`） | **修复** | 统一 `runWindowCommand()` 包装，失败 toast |
| `portalActions.ts` | **保留** | strip → 内容区的跨组件信道继续用它 |
| `ActivityBar` | **增强** | 承接唯一视图切换，补首次引导与可读标签 |
| 帮助菜单 | **新增 3 项** | 使用手册/FAQ、检查更新、快捷键一览；保留设置、关于、报告问题 |
| 托盘菜单（`lib.rs:60-61`） | **修复** | 文案走 i18n，Quit 补确认 |

---

## 5. 统一视觉与交互规范

### 5.1 唯一菜单语法

全应用只保留**一种**下拉菜单形态，由 `Layout/DropdownMenu.tsx` 统一提供：

| 项 | 规范 |
| --- | --- |
| 宽度 | 定宽 `w-56`（224px），不随内容伸缩 |
| 结构 | 分组（`DropdownGroup`）+ 项（`DropdownItem`）+ 分隔线 |
| 项高 | `min-h-8`，图标 14px，左图标右快捷键，快捷键列 `text-text-muted` |
| 圆角 | 与顶栏贴合：`rounded-b-lg`，不再混用 `-md` / `-xl` |
| 层级 | `z-50`，但对话框 `z-[10000]`（现状），两者不得互换 |
| 定位 | 统一 `useDropdownPosition()`：先向下，右/下溢出则 flip，永不裁切 |
| 动画 | 仅 `opacity` + `translateY(-2px)`，120ms，尊重 `prefers-reduced-motion` |

### 5.2 状态四态（缺一即为缺陷）

`default` / `hover` / `active`（当前生效项）/ `disabled`。

**禁用必须带原因**——这是本次改造的硬性要求：

> Chromium 对 `disabled` 元素不派发鼠标事件，`title` tooltip **不会出现**。因此禁用项必须用
> 包裹元素承接指针事件：
> `<span title={reason}><ActionButton disabled …/></span>`，
> 或改为 `aria-disabled` + `pointer-events-none` 的可聚焦按钮。
> 文案必须是「只读成员无法新建云文档，请联系空间所有者」，而不是「不可用」。

### 5.3 键盘模型（最小可用集）

菜单只剩一处，成本可控：`Esc` 关闭并归还焦点、`↑↓` 循环、`Home/End`、`Enter/Space` 触发、
`Tab` 退出菜单。`role="menu"` / `menuitem` / `aria-haspopup` / `aria-expanded` 全部补齐。

### 5.4 异常与反馈（上线门槛）

1. 任何 `invoke` 必须有 `catch`，失败走统一 toast，含可读原因。
2. 任何异步动作必须有 `pending`，按钮进 `aria-busy` + 禁用防重复提交。
3. `CustomEvent` 派发加回执：`dispatchAction` 返回是否被消费，未消费则提示「当前视图不支持该
   操作」——修复静默无操作。
4. 破坏性动作（退出应用）一律二次确认。

### 5.5 新帮助菜单结构

```text
帮助 ▾
 ├ 使用手册与常见问题   → 内置 Modal 渲染 docs/user-manual.md + user-faq.md（?raw 已在用）
 ├ 快捷键一览           → 静态表，随动作注册表生成
 ├ 检查更新             → 一级入口，四态：检查中 / 已最新 / 有新版本 / 失败(含原因+重试)
 ├ 报告问题             → GITHUB_URL /issues（复用 openInDefaultBrowser）
 ├ ────────────
 ├ 设置                 → App.openSettings()
 ├ 关于                 → 现有 AboutModal（去掉重复的检查更新按钮）
```

---

## 6. 分阶段落地

### P0 · 阻断级修复（不动结构，可独立发布）

目标：不改变任何入口位置，先把「会让用户丢数据或静默失败」的问题清掉。

1. 三处 `invoke` 加 `catch` + 失败提示。
2. 退出应用加二次确认（帮助菜单内即可，位置调整留到 P1）。
3. 禁用项补原因提示（包裹元素方案）。
4. 菜单溢出：加 flip/shift 定位，窄窗口不裁切。
5. 托盘菜单 i18n。
6. 补齐 `role` / `aria-haspopup` / `aria-expanded`，菜单项统一 `role="menuitem"`。

**验收**：窗口拉到 480px 宽三个菜单均完整可见；断开权限后点「新建云文档」能看到原因文案；
强制 `invoke` 失败有 toast 而非静默。

### P1 · 结构改造（本轮主体）

1. 建 `menuActions.ts` 注册表，先把传送门 20 项迁进去。
2. 按 §2 下沉 8 个唯一入口，笔记视图补动作 strip 的 `…` 菜单。
3. 删除工具菜单、传送门整块、`portalViewMeta`、`PortalActionButton`。
4. 重写帮助菜单，新增三项；关于弹窗去掉重复的检查更新。
5. 头像弹窗承接「退出应用」，三处入口统一走 `openSettings()` 单一通道。

**验收**：顶栏不再出现工具/传送门；§2 表内 20 个动作逐一可执行且**只有一个**入口可达；
`TitleBar.tsx` 行数从 636 降到 ~200（三个内联块迁出）。

### P2 · 打磨

1. 统一 `DropdownMenu` 组件，全应用替换。
2. 键盘模型 + 快捷键一览自动生成。
3. 旧入口一次性迁移提示（发布说明 + 首次启动 toast）。
4. 从注册表生成命令面板的数据层（仅预留，不做 UI）。

---

## 7. 兼容迁移与风险

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 存量用户找不到导入/导出 | 高 | 发布说明给迁移对照表；首次启动 toast 指向新位置 |
| 动作注册表与视图生命周期错配 | 中 | `enabled()` 读 store 而非 props，未挂载时返回 false 并给原因 |
| 笔记 strip 新增动作挤爆宽度 | 中 | 用 `container-name: shell-strip` 的 620px 断点丢 `.shell-strip__optional`，只留 `…` |
| `portalActions` 与注册表双轨 | 中 | 注册表的 `run()` 内部仍调 `dispatchAction`，信道不变，避免大改 |
| 帮助手册内置渲染体积 | 低 | 两文件已 `?raw` 进 AI 语料，复用时按需动态 import |

## 8. 未决

- 快捷键一览的具体条目：应用内加速键散落在 `NoteEditor` / `CanvasView` 的 keydown 分支，需先
  盘点成清单，再决定静态表还是从注册表生成。
- 帮助手册用内置 Modal 还是外链，涉及手册排版成本。
