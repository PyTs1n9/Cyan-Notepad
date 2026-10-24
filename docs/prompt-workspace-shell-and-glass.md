# 提示词：Qing Notepad 工作区「卡片盒子 + 全局毛玻璃」重构

> 读者：接手实现的编码 Agent（无上下文）。本文档自包含，按 §5 的顺序执行。
> 仓库约定见 `AGENTS.md`（Tauri v2 + React 19 + TS + Zustand）。
>
> **冲突裁决顺序**：本文档的「已定决策」> 现有代码风格 > 你的审美偏好。
> 若实现中发现文档与代码事实不符（符号改名、行号漂移等），**以代码为准**，按本意调整，
> 并在交付说明里列出偏差；不要静默改成另一套方案。**不要**为此回退到"先问用户"——一次性做完。

## 0. 执行须知

### 0.1 先读这些文件（读完再动手）

| 文件 | 看什么 |
| --- | --- |
| `src/App.tsx` | 常量 `COLLAPSED_WIDTH`/`ACTIVITY_BAR_WIDTH`；`appStyle`（背景图与 CSS 变量）；app-root 节点；主内容 flex 行；`handleSidebarPointerDown` 及其 pointermove effect |
| `src/components/Layout/sidebarLayout.ts` | 五个导出的宽度/阈值函数与 `SIDEBAR_*` 常量 |
| `src/components/Layout/ActivityBar.tsx` | 根节点 `w-12 … border-r border-border bg-bg-sidebar`、accent 指示条 `left-0` |
| `src/components/Layout/SidebarResizeHandle.tsx` | 5px 热区 + hairline + 3px accent 引导条，无宽度动画 |
| `src/components/Layout/Sidebar.tsx`、`TodoSidebar` | 各自根节点的不透明底 |
| `src/components/Layout/TitleBar.tsx` | 根节点 `h-9 bg-bg-secondary`、左侧 `w-12 bg-bg-sidebar` 占位块、`top-full` 下拉层 |
| `src/components/Layout/NoteTabBar.tsx` | 根节点底色，仅 note 视图渲染 |
| `src/components/Workspace/WorkspaceView.tsx` | 它自己在 main 内部渲染的侧栏 + 内部 `SidebarResizeHandle` |
| `src/components/AI/AiSidebar.tsx` | 根节点是否有不透明底 |
| `src/index.css` | `@theme`、四个 `.theme-*`、`.app-has-custom-background` 四条规则、`.sidebar-width-shell` / `.sidebar-collapsing` 相关 |
| `src/utils/theme.ts` | `applyTheme` 与 `CUSTOM_PROPS` 清理列表 |
| `src/utils/i18n.ts` | `TranslationKeys` 类型 + zh/en 两份记录 |
| `src/components/Settings/SettingsModal.tsx` | 主题页的 `rounded-xl border … bg-bg-secondary/35` 小节写法、滑块写法 |
| `src/stores/settingsStore.ts` | 已存在的 `glass*` 字段与校验常量 |

### 0.2 绝对不要动的

- `src-tauri/**`（本次不需要任何 Rust 改动）、任何 `data/**` 下文件。
- `src/utils/storage.ts` 的 `data/` 目录结构与 JSON schema。
- `Sidebar` 的搜索/筛选/标签逻辑、`NoteTree` 的树模型、`AiSidebar` 的会话逻辑。
- 便签窗（`body.sticky-body`）与磁贴窗：它们与主窗口共用 `index.css`。
  新增 CSS 必须以 `.app-root` 或 `.surface-glass` / `.shell-box` 为作用域，
  **不得让便签/磁贴窗口出现圆角盒、沟槽或磨砂**。改完要用 `?sticky=…`、`?tile=1&noteId=…` 各开一次确认。

### 0.3 非目标

- 不引入新依赖（不要 glass / motion 库）。
- 不改数据目录、i18n 机制、主题切换机制（`.theme-dark/.theme-blue/.theme-yellow/.theme-green` + 自定义调色板）。
- 不做亮暗自动切换、不做窗口无边框/透明窗口。

## 1. 目标

一句话：把主窗口从「三栏平面拼接」改成「沟槽底 + 三张悬浮卡片」，所有面板半透磨砂，
使背景图能透到左右栏。

## 2. 已定决策（13 条，勿改）

- **D1 形态**：卡片式三盒。左盒 = ActivityBar(48px) + 资源管理器侧栏，二者**同盒去分隔线**；
  编辑盒；AI 盒。圆角 `10px`，柔和边框 + 阴影。**盒子质感优先于 VSCode 还原度**。
- **D2 连通**：ActivityBar 去掉 `border-r` 与不透明底，与侧栏视觉连成一体，靠 hover / 选中态区分；
  保留左侧 2px accent 选中指示条。
- **D3 左盒按视图分两套形态**：
  - `note` / `todo`：完整左盒 = ActivityBar + 各自侧栏（Sidebar / TodoSidebar）。
  - `workspace` / `canvas`：左盒**只放 48px 图标列**。
  - **workspace 自己的侧栏不要上提到 App 层**，它继续在 `WorkspaceView` 内部渲染，
    成为编辑盒内部的「盒中盒」栏：无圆角、无磨砂、保留原有 `border-r`。
    理由：该侧栏有自己的 collapsed / resize 状态，上提要牵动 `WorkspaceView` 的 props 与拖拽状态，
    回归风险大于收益。
- **D4 顶栏与标签栏**：都在盒外。顶栏贴窗口四边（**不享受** 10px 外边距，保住自绘窗口按钮的贴角热区），
  用沟槽色 + 轻磨砂，不加圆角也不加 `overflow-hidden`（会裁掉它的 `top-full` 下拉层）。
  `NoteTabBar` 在编辑盒**内部**。
- **D5 层次色**：新增 `--color-bg-shell` 沟槽底色 token，四套预设各一值（见 §5.1），
  自定义主题由 `theme.ts` 派生。盒子面：左/右盒用 `--color-bg-sidebar` 派生，编辑盒用 `--color-bg-primary` 派生。
- **D6 间隙**：盒间沟槽 `10px`，由 resize handle 元素**自身**承担（不用 flex `gap`，
  否则只存在于某两个盒之间的间隙无法随 AI 栏关闭而收起）。三盒左/右/下外边距 `10px`，
  顶栏与三盒之间 `10px`。
- **D7 折叠**：左盒收缩为 `48px` 窄盒，圆角与边框保留；AI 盒宽度归 0 时**整盒与右侧沟槽一起消失**。
- **D8 套盒范围**：笔记、待办、工作区、画布四个视图都套编辑盒。
  但**只有 note 视图**在盒顶渲染 `NoteTabBar`（现状即如此，`App.tsx` 的 note 分支）；
  `todo` / `workspace` / `canvas` 用它们自己的头部，**不要**给它们塞 `NoteTabBar`。
- **D9 磨砂范围**：三盒 + 顶栏 + 模态框面板（设置 / 关于 / 登录 / 更新）。
  盒内部的子面板**一律不叠 `backdrop-filter`**（原因见 §4.5）。
- **D10 主卡片比侧栏更透，且永不低于可读下限**：主卡片的 tint 不设固定高下限，而是由侧栏 tint
  **派生**——无背景图时 `max(tint, 92)`（没有东西可透，保持近不透明）；有背景图时
  `clamp(tintBg − 20, 40, 76)`，再取 `min(结果, tintBg − 6)` 保证关系永不反转。
  同时侧栏在背景图模式下把基色压暗 15%（`--glass-panel-side`）：深色主题的
  `--color-bg-sidebar` 比 `--color-bg-primary` **更亮**，只提高 tint 会让侧栏反而变浅。
  弹窗**不跟随**这条派生，走自己的 `--glass-tint-dialog`（`max(tint, 88)`）。
- **D11 总开关关闭**：保留圆角、边框、沟槽、外边距，只把面板变完全不透明并去掉 blur。
  **不做整体回滚分支**。
- **D12 性能降级**：拖拽 resize 期间降级（blur → 4px、saturate → 100%），松手恢复。
  复用现有的 `sidebar-resizing` 类，不新增状态。
- **D13 两个收尾数值**：背景图上原有的 34% 主色遮罩降为 **15%**；
  窗口宽度 ≤ `720px` 时 padding 与沟槽降为 `6px`。

## 3. 事实基线（已核对，不要重新怀疑，也不要重做已完成项）

- `settingsStore.ts`：`glassEnabled / glassBlur / glassTint / glassSaturate / glassBlurBg / glassTintBg / glassSaturateBg`
  的 state 字段、setter、默认值、`loadSettings` 加载、校验范围**均已存在**。
  → **不需要重做 §状态层**；若发现缺失才按现有模式补。
- `index.css`：**没有** `--color-bg-shell`、**没有** `.surface-glass`、**没有** `--glass-*` 变量。
  已有 `.app-has-custom-background` 的四条规则（`.workspace-surface` / `.app-work-area-overlay` /
  `.workspace-editor-surface` / `.canvas-surface`），**全部保留原样**。
- `theme.ts`：`applyTheme` 维护 `THEME_CLASSES`（含 `theme-custom`）与 `CUSTOM_PROPS`（13 个属性，切换时逐个 `removeProperty`）。
- `App.tsx`：`COLLAPSED_WIDTH = 0`、`ACTIVITY_BAR_WIDTH = 48`；
  `ActivityBar` 始终渲染；`workspace`/`canvas` 视图**跳过** App 层的侧栏块；
  `NoteTabBar` 只在 note 分支；AI 壳与其 handle 相邻渲染；`inert` 挂在 AI 壳上。
- `sidebarLayout.ts`：`resolveSidebarWidth(pointerX, activityBarWidth)`、
  `isBelowSidebarCollapseThreshold(pointerX, activityBarWidth)`、
  `resolveRightSidebarWidth(pointerX, viewportWidth)`、
  `isBelowRightSidebarCollapseThreshold(pointerX, viewportWidth)`；
  常量 `SIDEBAR_MIN_WIDTH 240 / SIDEBAR_MAX_WIDTH 400 / AI_SIDEBAR_WIDTH 340 / AI_SIDEBAR_MAX_WIDTH 500 / SIDEBAR_COLLAPSE_THRESHOLD 180`。
- `ActivityBar`：根 `flex h-full w-12 … border-r border-border bg-bg-sidebar`；按钮 `h-11 w-11` / `h-10 w-11` 方角；
  选中指示条 `absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent`。
- `TitleBar`：根 `h-9 … bg-bg-secondary`；左侧占位块 `w-12 … bg-bg-sidebar`。
- `tauri.conf.json`：`1200×800`，`minWidth 480`，`minHeight 400`，`decorations: false`。

## 4. 毛玻璃规格

### 4.1 参数

| 用途 | 变量 | 默认 | 范围 | 谁可调 |
| --- | --- | --- | --- | --- |
| 基础 blur | `--glass-blur` | 12 px | 0–40 | 用户 |
| 基础 tint | `--glass-tint-side` | 80 % | 0–100 | 用户 |
| 基础 saturate | `--glass-saturate` | 120 % | 0–200 | 用户 |
| 背景图 blur | `--glass-blur`（覆盖） | 20 px | 0–40 | 用户 |
| 背景图 tint（侧栏） | `--glass-tint-side`（覆盖） | 83 % | 0–100 | 用户 |
| 背景图 saturate | `--glass-saturate`（覆盖） | 140 % | 0–200 | 用户 |
| 主卡片 tint | `--glass-tint-editor` | `max(tint, 92)` | 派生 | 不可调 |
| 主卡片 tint（有背景图） | `--glass-tint-editor` | `clamp(tintBg − 20, 40, 76)`，且 `≤ tintBg − 6` | 派生 | 不可调 |
| 弹窗 tint | `--glass-tint-dialog` | `max(tint, 88)` | 派生 | 不可调 |
| 侧栏基色（有背景图） | `--glass-panel-side` | `color-mix(in srgb, var(--color-bg-sidebar) 85%, #000)` | 派生 | 不可调 |
| 顶栏/轻磨砂 tint | `--glass-tint-light` | 60 % | 固定 | 不可调 |
| 总开关 | `data-glass="on" \| "off"` | on | — | 用户 |

**深层阶梯（背景图模式）**：侧栏 83% × 压暗基色 → 主卡片 63% → 顶栏 60%（shell 基色）→ 弹窗 88%。
即三盒里**两边实、中间透**；弹窗不在这条阶梯上，它要压住下面的所有面板。

**关键设计**：JS 只写"当前生效值"，CSS 不判断是否有背景图。
即 App.tsx 计算 `hasBg = !!customBackgroundUrl`，直接把生效值写进 `--glass-blur` / `--glass-saturate` /
`--glass-tint-side` / `--glass-tint-editor` / `--glass-tint-dialog` / `--glass-panel-side` / `--glass-tint-light`。
这样 CSS 里没有任何 `.app-has-custom-background` 分支，就不会出现选择器特异性互相覆盖的坑。

### 4.2 CSS 变量（`:root` 兜底默认）

```css
:root {
  --shell-pad: 10px;
  --shell-gutter: 10px;
  --box-radius: 10px;

  --glass-blur: 12;          /* 无单位数字，用时 ×1px */
  --glass-saturate: 120;     /* 无单位数字，用时 ×1% */
  --glass-tint-side: 80;     /* 无单位数字，用时 ×1% */
  --glass-tint-editor: 92;   /* 派生值，此处只是无 JS 兜底 */
  --glass-tint-dialog: 92;
  --glass-panel-side: var(--color-bg-sidebar);
  --glass-tint-light: 60;
}

/* 无 JS 时的窄窗兜底；断点值必须与 shellLayout.ts 的 SHELL_BREAKPOINT 一致 */
@media (max-width: 720px) {
  :root { --shell-pad: 6px; --shell-gutter: 6px; }
}
```

单位约定：tint / saturate / blur 在变量里一律存**无单位数字**，只有 `calc(var(--x) * 1%)` / `* 1px`
时才带单位。不要存 `"12px"`，否则 `calc()` 会产出非法值而静默失效。

### 4.3 工具类

三个类**必须按这个顺序**写在 `index.css`（变体在基础类之后，靠同特异性后者胜出来覆盖 `--glass-tint-here`）：

```css
.surface-glass {
  --glass-panel: var(--glass-panel-side);
  --glass-tint-here: var(--glass-tint-side);
  background-color: color-mix(in srgb, var(--glass-panel) calc(var(--glass-tint-here) * 1%), transparent);
  backdrop-filter: blur(calc(var(--glass-blur) * 1px)) saturate(calc(var(--glass-saturate) * 1%));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 1px)) saturate(calc(var(--glass-saturate) * 1%));
}

/* 主卡片：背景图模式下比侧栏更透，是三个盒里最轻的一个 */
.surface-glass--editor {
  --glass-panel: var(--color-bg-primary);
  --glass-tint-here: var(--glass-tint-editor);
}

/* 弹窗（设置 / 关于 / 登录 / 更新）：临时面，不在深度阶梯上，保持近不透明 */
.surface-glass--dialog {
  --glass-panel: var(--color-bg-primary);
  --glass-tint-here: var(--glass-tint-dialog);
}

/* 顶栏：更轻，blur 取基础的一半 */
.surface-glass--light {
  --glass-panel: var(--color-bg-shell);
  --glass-tint-here: var(--glass-tint-light);
  backdrop-filter: blur(calc(var(--glass-blur) * 0.6px)) saturate(calc(var(--glass-saturate) * 1%));
  -webkit-backdrop-filter: blur(calc(var(--glass-blur) * 0.6px)) saturate(calc(var(--glass-saturate) * 1%));
}

/* D11：总开关关闭 —— 盒子留着，只去磨砂 */
.app-root[data-glass="off"] .surface-glass {
  background-color: var(--glass-panel);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* D12：拖拽期间降级（复用现有 sidebar-resizing 类） */
.app-root.sidebar-resizing .surface-glass {
  backdrop-filter: blur(4px) saturate(100%);
  -webkit-backdrop-filter: blur(4px) saturate(100%);
  will-change: auto;
}

.shell-box {
  border-radius: var(--box-radius);
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 18%, transparent);
  overflow: hidden;
  isolation: isolate;
}
```

注意：
- `.shell-box` 的 `overflow: hidden` 只给三盒和模态面板加，**不要**加到 `TitleBar`（会裁下拉层）。
- `isolation: isolate` 让盒内 `z-index` 不外溢，避免盒内阴影/浮层漏到相邻盒。
- 深色主题下黑影几乎不可见，靠 border 的 `color-mix` 提亮边缘；若仍看不出层次，把 shadow 第二档
  加到 `0 2px 8px` 并只在亮色主题生效（`.theme-dark` 下收窄为 `0 1px 2px`）。

### 4.4 主卡片专属规则

- 主卡片 tint：无背景图 `max(用户 tint, 92)`；有背景图 `deriveGlassEditorTint(tintBg)` =
  `min(clamp(tintBg − 20, 40, 76), max(tintBg − 6, 0))`。
  **在 JS 里算**（`settingsStore.ts` 导出），不要试图在 CSS 的 `color-mix()` 里写 `max()`／`clamp()`
  （不同 WebView 版本支持度不一）。
- 主卡片**与侧栏共用同一个 blur**：用户把背景图模糊调低就是为了看清壁纸，给主卡片单独提模糊
  与这个意图直接冲突，可读性靠 tint 差值来控，不靠额外模糊。
- 主卡片仍保留 `backdrop-filter`：即使只剩 37% 透光，也要它是"模糊的透"，不是"清晰的透"。
- 主卡片内部的 `NoteTabBar`、工具栏、正文容器**不得**再叠 `backdrop-filter`，只做半透明染色。

### 4.5 嵌套禁令（最容易做错的一条）

`backdrop-filter` 会在元素上建立 **backdrop root**：一个元素的模糊只能采样到最近一层 backdrop root 之内的内容。
因此：

- **允许**加 `backdrop-filter`：三盒（它们是 app-root 的直接子级）、顶栏、模态框面板。
- **禁止**加 `backdrop-filter`：盒内的任何子面板——Sidebar 内部、NoteTabBar、编辑器工具栏、
  AI 消息气泡、画布浮层。它们即使加了 blur 也采样不到壁纸，只会额外生成一层全尺寸复合缓冲，白烧性能。
  这些地方需要"更强的底色"时，用 `background-color: color-mix(in srgb, var(--color-bg-primary) 72%, transparent)`。

这条也是原文档中「NoteTabBar 根节点加轻磨砂类」的修正：`NoteTabBar` 在编辑盒内部，只染色不 blur。

### 4.6 拖拽降级

- 触发点：已有代码在 `handleSidebarPointerDown` 里给 app-root 加 `sidebar-resizing`、pointerup 时移除。
  **不要新增拖拽状态**，直接用这个类（§4.3 已写好规则）。
- 移除路径必须仍然走到：现有清理逻辑在 pointerup/pointercancel/blur 三处，改动布局时确认这三处没被条件分支跳过。
  若拖拽后 blur 卡在 4px，就是这里漏了移除。
- 额外优化（可选、仅在实测仍掉帧时做）：`.sidebar-resizing .shell-box { box-shadow: none; }`。

### 4.7 已知渲染坑

- Chromium/WebView2 下 `backdrop-filter` + `border-radius` + `overflow: hidden` 常在圆角外沿出现
  1px 亮边或锯齿。出现时按顺序试：给盒加 `isolation: isolate` → 把模糊层搬到 `::before` 伪元素
  （`inset: 0; border-radius: inherit; z-index: -1`）→ 最后才降 blur 值。
- 无障碍/低性能模式：`@media (prefers-reduced-transparency: reduce)` 时把 tint 提到 100%（该特性支持面窄，不必强求）。

## 5. 实现步骤

按顺序做，每步可单独编译。除 §5.1 外都不涉及数据层。

### 5.1 `index.css`：沟槽色与变量

在 `@theme` 与四个 `.theme-*` 块里各加一行 `--color-bg-shell`，并在 `:root` 加 §4.2 的变量块。

沟槽色必须**在明度上与面板拉开一档**，否则半透明面板叠在同色沟槽上会看不出"悬浮"：

| 主题 | 面板色区间 | `--color-bg-shell` |
| --- | --- | --- |
| `@theme` / `.theme-blue`（默认） | `#f0f4f8` / `#dbe4ef` | `#c3cfdd` |
| `.theme-dark` | `#1a1b1e` / `#1e1f23` | `#0b0c0e` |
| `.theme-yellow` | `#faf6ec` / `#ebe5d2` | `#ddd2b8` |
| `.theme-green` | `#f4faf6` / `#deeadf` | `#c9ddcb` |

判据：沟槽与最近的面板色明度差 ≥ 6%（用取色器目测即可）。若微调后更协调，允许 ±1 档，但必须留下可辨识的沟槽。

> 注意 `@theme` 与 `.theme-blue` 是两份重复定义（默认主题靠 `@theme`，切到 blue 时靠 `.theme-blue`），**两处都要加**。

### 5.2 工具类

把 §4.3 的四个 `surface-glass` 变体（side / editor / dialog / light）、关闭态、降级规则、`.shell-box` 写进 `index.css`。
不要新增 `!important`；若被 Tailwind 工具类压住，优先调选择器特异性。

### 5.3 `theme.ts`：自定义主题派生沟槽色

- 在 `CUSTOM_PROPS` 数组里**追加** `"--color-bg-shell"`。
  漏了这一步，从自定义主题切回预设时 inline 值会残留，沟槽颜色错位——这是最容易忘的一处。
- 在 `theme === "custom"` 分支里 `setProperty("--color-bg-shell", …)`，按 `bgPrimary` 的相对亮度二选一：

  ```ts
  // 近似相对亮度：只看 R/G/B 加权，无需 sRGB 线性化，够用
  const luma = (hex: string) => { /* #rrggbb -> 0..1 */ };
  const shell = luma(customColors.bgPrimary) > 0.5
    ? `color-mix(in srgb, ${customColors.bgPrimary} 84%, #000 16%)`   // 浅色主题：压暗
    : `color-mix(in srgb, ${customColors.bgPrimary} 82%, #fff 18%)`;  // 深色主题：提亮方向不对时改用压暗
  ```

  深色自定义主题请实测：目标是"沟槽比面板暗一档"。若提亮后反而像高光带，改成压暗 20%。

### 5.4 `App.tsx` 布局重构（核心）

#### 5.4.1 新建 `src/components/Layout/shellLayout.ts`

与 `sidebarLayout.ts` 同目录、同风格，放布局常量与指针换算：

```ts
export const ACTIVITY_BAR_WIDTH = 48;
export const SHELL_BREAKPOINT = 720;
export const SHELL_PAD_WIDE = 10;
export const SHELL_PAD_NARROW = 6;
export const SHELL_GUTTER_WIDE = 10;
export const SHELL_GUTTER_NARROW = 6;
export const BOX_RADIUS = 10;

export function getShellMetrics(viewportWidth: number) {
  const narrow = viewportWidth <= SHELL_BREAKPOINT;
  return {
    pad: narrow ? SHELL_PAD_NARROW : SHELL_PAD_WIDE,
    gutter: narrow ? SHELL_GUTTER_NARROW : SHELL_GUTTER_WIDE,
  };
}

/** 左侧两类侧栏的指针基准偏移（传给 resolveSidebarWidth / isBelowSidebarCollapseThreshold）。 */
export function leftSidebarOffset(kind: "notebook" | "workspace", m: { pad: number; gutter: number }) {
  const editorLeft = m.pad + ACTIVITY_BAR_WIDTH + m.gutter; // 编辑盒左边界
  // notebook 的 handle 就是盒间沟槽（宽 = gutter），取沟槽中心
  return kind === "notebook" ? m.pad + ACTIVITY_BAR_WIDTH + m.gutter / 2 : editorLeft + 2.5;
}

/** 右侧 AI 栏的"有效视口右边界"（传给 resolveRightSidebarWidth / isBelowRightSidebarCollapseThreshold）。 */
export function rightSidebarLimit(viewportWidth: number, m: { pad: number; gutter: number }) {
  return viewportWidth - m.pad - m.gutter / 2;
}
```

`App.tsx` 里删掉本地的 `ACTIVITY_BAR_WIDTH` 定义，改为 import（避免两处数值漂移）。

#### 5.4.2 指针数学（必须改，否则拖拽会偏 10~16px）

`handleSidebarPointerDown` 的 pointermove 里，每次移动都重新取 `const vw = document.documentElement.clientWidth;`
与 `const m = getShellMetrics(vw)`，然后：

| 目标 | 宽度 | 折叠判定 |
| --- | --- | --- |
| notebook | `resolveSidebarWidth(x, leftSidebarOffset("notebook", m))` | `isBelowSidebarCollapseThreshold(x, m.pad + ACTIVITY_BAR_WIDTH)` |
| workspace | `resolveSidebarWidth(x, leftSidebarOffset("workspace", m))` | 同上（沿用 notebook 的判定基准） |
| ai | `resolveRightSidebarWidth(x, rightSidebarLimit(vw, m))` | `isBelowRightSidebarCollapseThreshold(x, vw - m.pad)` |

要点：
- notebook 的 handle 现在是 10px 沟槽，宽度换算取**沟槽左边缘**为基准，所以偏移里加 `gutter / 2`；
  不这么写会稳定偏 5px。
- workspace 的 handle 仍在 `WorkspaceView` 内部、仍是 5px，所以偏移是"编辑盒左边界 + 2.5px"。
  这也意味着 **workspace 侧栏的宽度语义从"从图标列右侧算起"变成"从编辑盒左边界算起"**，
  首次渲染会窄 10px；可接受，不要为了抹平它去改存储值。
- 折叠阈值仍用 `SIDEBAR_COLLAPSE_THRESHOLD`（180），语义是"指针到侧栏起点"的距离，不加 `gutter / 2`。

#### 5.4.3 结构

app-root 保持 `ref`、`className` 上的 `app-has-custom-background`、`style`（CSS 变量 + 背景图）。改三件事：

1. 类名去掉 `bg-bg-primary`，改由 `style.background` 决定：有背景图时保留原 `background-image` 与
   **降到 15%** 的遮罩渐变；无背景图时 `background-color: var(--color-bg-shell)`。
2. 加 `className="app-root …"`（新类名 `app-root` 供关闭态与降级规则选择）与 `data-glass={glassEnabled ? "on" : "off"}`。
3. `style` 里追加 §4.1 的五个生效值：

```ts
const hasBg = Boolean(customBackgroundUrl);
const sideTint = hasBg ? glassTintBg : glassTint;
const glassVars = {
  "--glass-blur": String(hasBg ? glassBlurBg : glassBlur),
  "--glass-saturate": String(hasBg ? glassSaturateBg : glassSaturate),
  "--glass-tint-side": String(sideTint),
  "--glass-tint-editor": String(hasBg ? deriveGlassEditorTint(sideTint) : Math.max(glassTint, 92)),
  "--glass-tint-dialog": String(Math.max(sideTint, 88)),
  "--glass-panel-side": hasBg
    ? `color-mix(in srgb, var(--color-bg-sidebar) ${100 - GLASS_RAIL_DARKEN}%, #000)`
    : "var(--color-bg-sidebar)",
  "--glass-tint-light": "60",
  "--shell-pad": `${shell.pad}px`,
  "--shell-gutter": `${shell.gutter}px`,
};
```

`shell` 由 `getShellMetrics(document.documentElement.clientWidth)` 得来；窗口缩放时需随 `resize` 更新
（`useEffect` + `requestAnimationFrame` 节流即可，不需要 context）。

结构（只列层级与关键类，原有分支逻辑照搬）：

```jsx
<div ref={appRootRef} className="app-root flex h-screen w-screen flex-col overflow-hidden" style={appStyle} data-glass={…}>
  <TitleBar … />                                  {/* h-9 全宽贴边；加 surface-glass surface-glass--light；不加 shell-box */}

  <div className="flex min-h-0 flex-1 px-[var(--shell-pad)] pb-[var(--shell-pad)] pt-[var(--shell-gutter)]">
    {/* ① 左盒 */}
    <div className="shell-box surface-glass flex flex-shrink-0 overflow-hidden">
      <ActivityBar … />
      {currentView === "note" || currentView === "todo" ? (
        <div style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : "var(--notebook-sidebar-width)" }}
             className="sidebar-width-shell h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out…">
          {currentView === "todo" ? <TodoSidebar /> : <Sidebar … />}
        </div>
      ) : null}
    </div>

    {/* ② 左侧沟槽 / handle；workspace、canvas 放空占位保持间距 */}
    {currentView === "note" || currentView === "todo"
      ? (!sidebarCollapsed || resizingSidebarState === "notebook")
        && <SidebarResizeHandle onPointerDown={() => handleSidebarPointerDown("notebook")} />
      : <div className="w-[var(--shell-gutter)] flex-shrink-0" />}

    {/* ③ 编辑盒：四视图都进这里，note 分支里才渲染 NoteTabBar */}
    <main className="shell-box surface-glass surface-glass--editor flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* 原 App.tsx 的四视图分支原样搬入 */}
    </main>

    {/* ④ 右侧沟槽：AI 打开或拖拽中才存在，关闭时不留间隙 */}
    {(aiSidebarOpen || resizingSidebarState === "ai") && (
      <SidebarResizeHandle onPointerDown={() => handleSidebarPointerDown("ai")} />
    )}

    {/* ⑤ AI 壳：壳只做宽度动画与裁切，盒样式放在壳内面板上 */}
    <div inert={aiSidebarOpen ? undefined : true}
         style={{ width: aiSidebarOpen ? "var(--ai-sidebar-width)" : COLLAPSED_WIDTH }}
         className="sidebar-width-shell h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out…">
      <div className="shell-box surface-glass h-full w-[var(--ai-sidebar-width)]">
        <AiSidebar onOpenSettings={…} />
      </div>
    </div>
  </div>
  {/* 模态框保持挂载位置不变 */}
</div>
```

不可省的细节：

- **沟槽用元素、不用 `flex gap`**：`SidebarResizeHandle` 的宽度从 `w-[5px]` 改为
  `w-[var(--shell-gutter)]`，它自己就是沟槽。`WorkspaceView` 内部那个 handle **不改宽度**（它不在盒间）。
- AI 盒的 `.shell-box` 加在**壳内面板**上，且该面板必须显式 `w-[var(--ai-sidebar-width)]`。
  若把盒样式加在宽度会归 0 的壳上，关闭后会在窗口右缘残留 1~2px 的边框线，并且 200ms 动画期间聊天内容会回流。
- 左盒的 `sidebar-width-shell` 仍用 `COLLAPSED_WIDTH = 0`，左盒自然变成 48px 窄盒；**不要**给左盒写死 `w-[48px]`。
- `overflow-hidden` 加在左盒、编辑盒、AI 面板三处；**ActivityBar 不要**再单独加 `overflow-hidden`（它已经在盒里）。
- 顶栏右侧的窗口按钮（最小化/最大化/关闭）位置不变，仍贴窗口右上角。

### 5.5 去不透明底（否则磨砂看不到壁纸）

| 文件 | 改动 |
| --- | --- |
| `ActivityBar.tsx` | 根节点删 `border-r border-border` 与 `bg-bg-sidebar`（改 `bg-transparent`）。按钮保持方角，圆角由盒的 `overflow: hidden` 裁切；若首尾按钮的 hover 方块出现难看的硬角，再给按钮加 `rounded-md`，不要给整列加 padding。 |
| `Sidebar.tsx` / `TodoSidebar` | 删掉根节点不透明底（`bg-bg-sidebar`）；内部 hover / 选中 / 拖拽高亮**全部保留**。 |
| `AiSidebar.tsx` | 确认根节点无不透明底；有就删。它已被 §5.4 的面板 `.surface-glass` 承托。 |
| `NoteTabBar.tsx` | 根节点不透明底改为 `background-color: color-mix(in srgb, var(--color-bg-primary) 72%, transparent)`；**不加** `backdrop-filter`（§4.5）；`border-b` 保留。 |
| `WorkspaceView.tsx` 的内部侧栏 | **不动**。它在编辑盒内部，保留原有 `border-r` 与不透明底，是"盒中盒"。 |

### 5.6 设置 UI + i18n

`SettingsModal.tsx` 的主题页、自定义背景图小节之后，新增「毛玻璃」分组：

- 一个开关行：`glassEnabled` ↔ `setGlassEnabled`。
- 子分组「基础（始终）」：三个滑块，绑定 `glassBlur`(0–40) / `glassTint`(0–100) / `glassSaturate`(0–200)。
- 子分组「仅背景图片时」：三个滑块，绑定 `glassBlurBg` / `glassTintBg` / `glassSaturateBg`（同范围）。
- `onChange` 直接调对应 setter，右侧显示当前值（`px` / `%` / `%`）。改动通过 §5.4.3 的 `style` 即时反映。
- 当 `glassEnabled === false` 时，六个滑块置 `disabled` 并降到 `opacity-50`（参数仍保留）。
- 不要新增「恢复默认」按钮（默认值已在 `settingsStore` 的常量里，越界会被 clamp）。

**i18n 是硬要求**：`src/utils/i18n.ts` 是带类型约束的表，新增 `TranslationKeys` 字段后
zh / en 两份记录都必须补齐，否则 `tsc` 直接报缺字段。需要的新 key（命名可微调，但必须成对）：

```text
glassGroup            毛玻璃 / Frosted glass
glassGroupHint        面板半透明与模糊强度 / Panel translucency and blur
glassEnable           启用毛玻璃 / Enable frosted glass
glassBaseGroup        基础（始终） / Base (always)
glassBgGroup          仅背景图片时 / Only with a wallpaper
glassBlur             模糊强度 / Blur
glassTint             底色不透明度 / Tint opacity
glassSaturate         饱和度 / Saturation
```

### 5.7 自检

1. `npx tsc --noEmit`：重点看 `i18n.ts` 缺字段、未使用的 `bg-bg-sidebar` 引用、`CSSProperties` 里的自定义变量
   （JS 对象写 `--x` 键需要 `as CSSProperties`，现有代码已有这个写法，照抄）。
2. `npm run build`（**Windows 必须用 PowerShell**，Git Bash 下 `import.meta.glob` 解析 `@/assets/sponsors/*` 会因小写盘符失败）。
3. `npm run tauri dev` 人工走一遍 §6。

## 6. 验收标准

- [ ] 启动即三块悬浮卡片（左盒 / 编辑盒 / AI 盒），圆角 10px，左/右/下三边各 10px 沟槽；顶栏贴窗口四边，
      与三盒之间有 10px 沟槽；顶栏右上的最小化/最大化/关闭仍贴角。
- [ ] `note` 视图：ActivityBar 与资源管理器之间**没有**分隔线；选中态只靠图标高亮 + 2px accent 条区分。
- [ ] `workspace` 视图：左盒只有 48px 图标列；workspace 自己的侧栏出现在编辑盒内部，仍有自己的分隔线与拖拽，
      且不呈现圆角/磨砂。
- [ ] `todo` / `canvas` 视图同样套盒；四个视图切换过程中不闪白、不出现双滚动条。
- [ ] 四套预设主题 + 自定义主题下，沟槽色都明显深于/浅于面板一档，自定义主题切换回预设后沟槽色不残留。
- [ ] 设置 → 毛玻璃：开关与六个滑块可用，拖动滑块看板即时变化；关闭开关后所有面板变完全不透明、
      圆角与沟槽仍在。
- [ ] 设置一张背景图后：左盒、编辑盒、AI 盒都透出壁纸且是"模糊的透"；**中间编辑盒比左右两盒更透**
      （`clamp(tintBg − 20, 40, 76)` 生效），左右两盒基色被压暗 15%，三盒能看出"两边实、中间透"；
      背景图遮罩为 15%，壁纸仍可辨识。
- [ ] 设置 / 关于 / 更新 / 登录四个弹窗在有背景图时**仍然接近不透明**（`--glass-tint-dialog`），
      不会跟着主卡片一起变透。
- [ ] 把侧栏底色滑块拖到 20 / 60 / 95 三档：主卡片始终比侧栏透，且不会低于 40，也不会高于 76。
- [ ] 拖拽左/右栏宽度时：面板跟随指针，**偏差 ≤ 2px**；拖到阈值处按原动画折叠；松手后模糊恢复全值。
- [ ] 折叠左栏 → 左盒为 48px 窄盒，圆角与边框完整；关闭 AI 栏 → 无残留间隙、无残留边框线、编辑器贴到右侧沟槽。
- [ ] 树节点右键菜单、拖拽移动、`MoveToFolderDialog`、标签栏溢出菜单、画布缩放浮层均未被圆角裁切。
      （被裁切 → 该浮层改走 `createPortal`，不要为了让路而撤掉 `overflow: hidden`。）
- [ ] 便签窗（`?sticky=…`）与磁贴窗（`?tile=1&noteId=…`）视觉与改造前一致，无圆角盒、无磨砂。
- [ ] `npx tsc --noEmit` 通过；`npm run build` 通过（PowerShell）。
- [ ] DevTools Performance 录一次拖拽：无 > 50ms 的长任务。

## 7. 风险与排查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 壁纸透不出来，面板还是实色 | 某个祖先有不透明底（`bg-bg-primary` 没去掉），或子面板自己带不透明底 | 从盒往上逐个删底；确认 `body` / app-root 的底色没有盖住 `background-image` |
| 有磨砂但看不到壁纸 | 盒内子面板又有不透明底，把盒的半透层遮住了 | §5.5 表格逐项核对 |
| 拖拽宽度偏 5 或 10px | 偏移没加 `gutter / 2`，或 workspace 用了 notebook 的偏移 | 回 §5.4.2 的表 |
| 关闭 AI 栏后右缘有细线 | 盒样式加在了宽度归 0 的壳上 | 盒样式移到壳内面板（§5.4.3） |
| 拖完后一直很糊 | `sidebar-resizing` 类没移除 | 检查 pointerup / pointercancel / blur 三处清理是否被条件跳过 |
| 下拉/右键菜单被切掉 | `overflow: hidden` 裁切 | 浮层改 portal；**不要**撤掉盒的 `overflow: hidden`（圆角会露角） |
| 圆角外沿有 1px 亮边 | WebView2 的 blur+圆角合成 | §4.7 的三级处理顺序 |
| 自定义主题下沟槽发蓝 | `--color-bg-shell` 没写进 `CUSTOM_PROPS` 清理列表 | §5.3 |
| 深色主题看不出卡片层次 | 阴影不可见 | 加强 border 的 `color-mix`，阴影只在亮色主题生效 |
| 480px 窄窗下正文被压到不可用 | 10px 沟槽未降级 | 确认 `getShellMetrics` 的断点与 CSS `@media` 断点都是 720 |
| 切换主题瞬间闪一下 | `transition` 与 inline 变量同时变 | 保持现有 0.2s `background-color` 过渡习惯，不额外加 `backdrop-filter` 过渡（blur 过渡会每帧重建模糊层） |

## 附录 A：一次改完的检查清单

1. `index.css`：5 处 `--color-bg-shell`、`:root` 变量、四个 `surface-glass` 变体（side / editor / dialog / light）、关闭态、降级规则、`.shell-box`。
2. `theme.ts`：`CUSTOM_PROPS` + 一行派生。
3. `shellLayout.ts`：新建，导出常量与两个换算函数。
4. `App.tsx`：import 常量、`glassVars`/`shell` 写入 style、`data-glass`、主内容重构、pointer 数学三处、
   背景遮罩 34% → 15%。
5. `SidebarResizeHandle.tsx`：`w-[5px]` → `w-[var(--shell-gutter)]`，hairline 与 accent 条保留。
6. `ActivityBar.tsx` / `Sidebar.tsx` / `TodoSidebar` / `AiSidebar.tsx` / `NoteTabBar.tsx`：去不透明底 + 染色。
7. `SettingsModal.tsx`：毛玻璃分组。
8. `i18n.ts`：8 个 key × 2 语言。
9. 自检 §5.7。

## 附录 B：相对上一版的修正点

供评审对照，实现时以正文为准。

1. 原文"主内容区结构改为纵向 `flex`"是笔误——三盒是横向排列，纵向只发生在 app-root 外层。
2. 原文只说 `resolveSidebarWidth` 要加 10px 偏移；实际 `isBelowSidebarCollapseThreshold`、
   `resolveRightSidebarWidth`、`isBelowRightSidebarCollapseThreshold` 三处都要换算，
   且 notebook / workspace 的基准不同（§5.4.2）。
3. 补 D3：workspace 侧栏不上提，`canvas` 无侧栏——原文只写"四个视图套同一框架"，执行时会卡在这一步。
4. 补 D8：`NoteTabBar` 只在 note 分支渲染，原文"含 NoteTabBar + 编辑器（四视图均入此盒）"会被误读成给四个视图都加标签栏。
5. 纠正"NoteTabBar 加轻磨砂类"：它在编辑盒内部，加 `backdrop-filter` 无效且浪费，改为只染色（§4.5）。
6. 补 D11（开关关闭后的形态）、D12（拖拽降级）、D13（遮罩 15%、窄窗 6px）——原文完全没写。
7. 补编辑器 tint 下限（D10）：原文三盒一视同仁，长文对比度会崩。
8. 补 i18n 硬要求：原文没提 `i18n.ts`，照原文实现 `tsc` 必然失败。
9. 补 `CUSTOM_PROPS` 清理（§5.3）：原文只说派生，漏了切换主题时的残留。
10. 沟槽色重定（§5.1）：原文给的 blue `#dde5ef` 与面板 `#dbe4ef` 几乎同色，沟槽等于不存在。
11. 补 AI 盒的"盒样式放壳内面板"（§5.4.3）：否则关闭后残留边框线、动画期间内容回流。
12. 补事实基线（§3），把已完成的 `settingsStore` 字段、`index.css` 现状写死，避免执行者重复实现或误判。
