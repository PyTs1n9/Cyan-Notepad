# 决策记录：拖拽收缩即折叠侧栏

日期：2026-10-22
状态：已确认，已执行

## 背景

现状：侧栏宽度拖拽被硬钳在 `SIDEBAR_MIN_WIDTH = 240` 与 `MAX_SIDEBAR = 400` 之间
（`src/App.tsx` 的 pointermove / pointerup），折叠只能通过 ActivityBar 的按钮触发，
折叠宽度 `COLLAPSED_WIDTH = 0`。notebook 与 workspace 两个侧栏各有独立的宽度与折叠状态，
拖拽把手在折叠时被卸载。

需求：把侧栏往左拖到一定程度，直接判定为「收起」，而不是停在一个固定的最小宽度上。

## 结论

### 1. 折叠触发点

结论：可用下限仍是 240，指针位置产生的宽度 **小于 180** 才判折叠（`SIDEBAR_COLLAPSE_THRESHOLD`）。
理由：240 到 180 的 60px 是指针必须掠过钳制宽度后继续左移的距离，用来排除误触；同时不必改动
已有的 240 可用下限，侧栏内部布局（分类面板、操作文案宽度）不受影响。

### 2. 判定时机与展开门槛

结论：拖拽过程中实时判定并立即收起；展开使用**同一阈值 180**（不做双向滞后）。
理由：若只在松手时判定，拖动过程中侧栏仍像被硬最小值挡住，手感与「收缩即收起」的目标不符。
单阈值是位置驱动的确定性判定，指针在同一位置不会来回翻转，因此不需要额外滞后带。

### 3. 过渡动效

结论：折叠与展开各走 200ms `cubic-bezier(0.33,1,0.68,1)` 的宽度过渡，普通拖拽仍即时跟手。
理由：第一版是「越过阈值一帧内归零」，用户反馈消失太突然。动效在此充当预兆：
侧栏是「收拢」而不是「凭空消失」。实现上拖拽期间原本 `transition: none`，
故新增 `.sidebar-collapse-anim` 在被 `.sidebar-resizing` 覆盖时以更高特异性恢复宽度过渡；
该类在状态翻转的同一提交里挂上、240ms 后摘除，避免普通拖拽也带上缓动而变粘手。

### 4. 展开后的宽度

结论：恢复到折叠前最后一次可用的宽度，不回到 240。
理由：折叠是临时收起。实现上 `sidebarWidth` / `workspaceSidebarWidth` 永不接收小于 240 的值，
折叠时不动它，展开自然回到用户刚调好的宽度，无需额外的「记忆宽度」状态。

### 5. 拖拽预览宽度

结论：拖拽中宽度仍钳在 240，180–240 之间不跟随指针缩小。
理由：低于 240 时侧栏内容（分类面板、操作按钮）会横向裁切，用一个必然裁切的预览去换
「边缘贴手」不划算；用过渡动效解决突然感，代价更小。

### 6. 作用范围

结论：notebook 与 workspace 侧栏一起改。
理由：两者共用同一套拖拽实现，只改一处会让两个视图的拖拽手感不一致。

### 7. 拖拽把手的挂载

结论：折叠瞬间不卸载拖拽把手，把手改为 `width > 0 || 正在拖拽` 时挂载（notebook 用
`resizingSidebarState`，workspace 通过 `sidebarResizing` prop）。
理由：把手被卸载会连带释放 pointer capture。保持挂载可让一次拖拽连续完成
「展开 → 收起 → 再展开」，不必重新按下。

## 实现位置

- `src/components/Layout/sidebarLayout.ts`：`SIDEBAR_MAX_WIDTH`、`SIDEBAR_COLLAPSE_THRESHOLD = 180`、
  `resolveSidebarWidth()`、`isBelowSidebarCollapseThreshold()`。
- `src/App.tsx`：拖拽状态机（`latestSidebarCollapsed` 预览态 + `setSidebarCollapsedState` +
  `pulseCollapseAnim` + `finishResize(pointerX?)`），notebook 把手挂载条件与 `sidebar-collapse-anim` 类。
- `src/components/Workspace/WorkspaceView.tsx`：可选 `sidebarResizing` / `sidebarCollapseAnimating` prop。
- `src/index.css`：`.sidebar-resizing .sidebar-width-shell.sidebar-collapse-anim` 的 200ms 宽度过渡。

## 暂未确定

- 侧栏宽度与折叠状态目前只在内存里，重启恢复默认（240 / 展开）。是否写入 `settings.json` 另行决定。
- `SIDEBAR_LABEL_MIN_WIDTH` 已无引用，属遗留常量，未在本轮清理。
