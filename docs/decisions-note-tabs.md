# 决策记录：笔记标签栏（note tabs）

日期：2026-10-22
状态：已确认并实施

## 背景

每打开一篇笔记都要回左侧列表找，频繁在几篇笔记之间来回跳时效率很低。
目标是加一条浏览器式的标签栏，把"当前打开过哪些笔记"变成一眼可见、一点即达的状态。

改动前的事实基础（已核对代码）：

- `ViewType`（note / todo / workspace / canvas）是顶层互斥视图，由 `App.tsx` 的 `currentView` 与 `ActivityBar` 控制。
- 笔记视图内，`noteStore.activeNoteId` 是唯一的活动笔记标识，`NoteEditor` 监听它变化后重新加载内容。
- `NoteEditor` 内部已有 `isDirty` 本地状态、`autoSaveInterval` 定时保存（默认 `0`，即关闭自动保存）与 Ctrl+S。
- 切换笔记时 `NoteEditor` 会先把上一篇写盘，这既是保存机制，也是本次需要修正的竞态来源。

## 已确认的前提

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 作用域 | 仅笔记视图；待办 / 画布 / 协作文档继续走左侧活动栏 | 混排需要把 `ViewType` 从互斥视图改成"页面实例路由"，画布与协作各有独立 side panel 状态，重构风险远大于收益 |
| 打开语义 | 单击 = 预览标签（可被下一个单击顶掉）；双击 = 固定 | VS Code 惯例；预览态让"翻着看"不会把标签栏撑爆 |
| 转正条件 | 双击，或编辑器内容发生任何修改，或在右键菜单里固定 | 只靠双击会在"改了内容又被顶掉"时造成内容被静默替换的观感 |
| 关闭最后一个标签 | 保留空状态，不自动打开别的笔记 | 避免用户误判"笔记丢了" |
| 持久化 | 固定标签、顺序、活动项写入 `data/ui-state.json`；预览标签不持久化 | 预览本质上没被正式打开过，恢复它会稀释标签栏的可信度 |
| 存储位置 | 独立文件，不塞进 `settings.json` | 会话状态与用户偏好分离，设置同步不会把它带走，损坏也互不影响 |
| 宽度策略 | `flex-basis 208px`、最小 96px，超出后横向滚动；不设自动关闭上限 | 自动关闭会造成静默丢失上下文 |
| 交互范围 | 单击/双击/关闭/中键关闭/右键菜单（关闭、关闭其他、关闭右侧、全部关闭、固定）/横向溢出滚动/拖拽调序 |
| 未保存标记 | 关闭按钮位置在脏态显示实心圆点，悬停变回叉；保存落盘后圆点消失 |

## 视觉规范（2026-10-22 追加）

用户要求「加圆角阴影、鼠标移上去有小效果」，据此定下标签的观感：

| 部位 | 处理 |
| --- | --- |
| 标签条 | 高 36px，`px-1.5` + `gap-1`，标签垂直居中（上下各留 4px 供 hover 位移） |
| 标签本体 | 高 28px、`rounded-lg` 胶囊，去掉原先标签之间的竖分隔线，改用间距分隔 |
| 活动标签 | `bg-bg-primary` + `shadow-sm` + `ring-1 ring-border/70`，顶部居中 24px 圆角 accent 短线，图标转 accent 色 |
| 非活动标签 | `text-text-muted`，hover 时背景 `bg-bg-hover`、文字提级、浮现 `shadow-sm` 与 `ring-border/50`、整体上移 1px、图标不透明度 0.6 → 1 |
| 过渡 | `transition-[background-color,color,box-shadow,transform] 150ms ease-out` |
| 拖拽态 | `scale-[0.98]` + `opacity-40`，表示被拿起 |
| 关闭按钮 | 5×5 圆角方块，hover 底色 `bg-bg-active`；未脏时仅活动标签常显、非活动标签 hover 才浮现 |

不用整行渐变或彩色底：标签条横跨整个内容区，大面积着色会与四套主题（dark/blue/yellow/green）撞色；用「背景层差 + 细描边 + 阴影」三件套可以在所有主题下都成立。

## 溢出滚动（2026-10-22 追加，修复「标签多了不能滚」）

**根因**：Chromium 不会把垂直滚轮增量映射到「只能横向滚动」的容器上，而标签条为了保持 36px 高度把横向滚动条隐藏了（`.note-tab-strip::-webkit-scrollbar { height: 0 }`）。结果滚轮无效、也没有滚动条可拖，看起来就是「滚不动」。布局本身没有问题——离屏实测 12 个标签 / 700px 容器时 `scrollWidth=1208 > clientWidth=700`，可滚 508px，标签也确实压缩到了 96px 下限。

**做法**：

1. 在标签条上以 `{ passive: false }` 原生监听 `wheel`，把 `deltaY`（或 `deltaX`）直接加到 `scrollLeft`；内容未溢出时不做拦截。
2. 两端各一枚 24px 的渐隐箭头按钮，仅在该侧仍有隐藏标签时出现；点击滚动 60% 可视宽度（最少 160px，`behavior: "smooth"`）。
3. 用 `ResizeObserver` + `scroll` 事件维护 `canScroll.left/right`，并用引用比较避免滚动时的高频重渲染。

**放弃**：恢复常驻滚动条（会让 `items-center` 的标签在 hover 时上下跳 1.5px）、Shift+滚轮提示（用户不该被要求记住组合键）。

## 实现要点

新增文件：
- `src/stores/tabStore.ts`：`tabs: { id, preview }[]`、`dirtyIds: string[]`、`hydrated`，以及 open / pin / close / closeOthers / closeToRight / closeAll / move / markDirty / pruneMissing / restoreTabs。
- `src/components/Layout/NoteTabBar.tsx`：标签条、右键菜单、HTML5 拖拽调序、脏点/叉的二态关闭按钮。

改动文件：

- `src/utils/storage.ts`：新增 `loadUiState` / `saveUiState`（`data/ui-state.json`）。
- `src/App.tsx`：渲染标签条；初始化时恢复会话；`notes` 变化时清理失效标签；任何非标签入口（新建、托盘、全局快捷键）打开的笔记自动并入标签条；变更后 400ms 防抖写盘。
- `src/components/Layout/Sidebar.tsx`：单击走 `openTab({ preview: true })`，双击走 `pinTab`。
- `src/components/Editor/NoteEditor.tsx`：`isDirty` 由本地 state 改为按 noteId 从 `tabStore.dirtyIds` 派生。
- `src/utils/i18n.ts`：新增 7 条中英文案。
- `src/index.css`：`.note-tab-strip` 隐藏横向滚动条。

## 结论一：脏标记从组件状态上移为"按笔记记录"

**做法**：`NoteEditor` 不再持有 `isDirty`，改为

```ts
const dirtyIds = useTabStore((s) => s.dirtyIds);
const isDirty = activeNoteId ? dirtyIds.includes(activeNoteId) : false;
```

写入点统一调 `markDirty(noteId, true / false)`。

**理由**：

1. 多标签下"脏"是笔记的属性，不是编辑器的属性。留在组件里会出现：切到 B 后 A 的脏标记被 B 的状态覆盖，切回 A 时圆点已经消失，但内容确实没落盘。
2. 默认 `autoSaveInterval = 0`，脏窗口可能持续很久，标记必须可靠；上移后它只在写盘成功后才被清除。
3. `markDirty(noteId, true)` 顺带把预览标签转正，把"编辑即固定"这条规则集中在一处，不依赖调用方记得补一次 `pinTab`。

## 结论二：切换笔记的保存与加载改为串行

**做法**：`activeNoteId` 变化的 effect 里先 `await` 上一篇的 `saveNoteContent`，再 `loadNoteContent` 新一篇；旧内容在清空编辑器**之前**用 `pendingContent` 捕获。

**理由**：

1. 原实现是"发起保存 promise 后立刻读新笔记"，两者并行。标签栏把切换变成一次点击，用户会连点，读操作很可能先于写操作完成，于是读回旧内容并把刚输入的文字覆盖掉。
2. 磁盘写入是本地文件，串行带来的额外延迟在毫秒级，远小于一次内容丢失的代价。

## 结论三：标签条与编辑器之间的布局包裹

**做法**：`NoteEditor` 根节点保持 `h-full flex-1`，在 `App.tsx` 里用一个 `flex min-h-0 flex-1 flex-col overflow-hidden` 的 `div` 包住它，标签条作为该容器的兄弟节点。

**理由**：`h-full` 在 column flex 中等于父容器全高，与 36px 的标签条叠加会溢出 36px 并在底部被裁掉。给编辑器一个自适应高度的父容器比修改编辑器自身的布局类风险更小（编辑器根节点同时被空状态分支复用）。

## 放弃的方案

- **在 `TitleBar` 里直接长标签**：省 36px 垂直空间，但要重做标题栏的拖拽区域与窗口按钮避让，改动面与回归面都明显更大。
- **把已打开笔记列表放进 `noteStore`**：会让笔记数据与 UI 会话状态耦合，删除笔记、恢复回收站等逻辑都要顺带维护标签，边界变多。
- **预览标签也持久化**：重启后会出现一批"其实没被正式打开过"的笔记，标签栏的可信度下降。
- **标签数超限自动关闭最久未访问**：静默丢失上下文，用户通常无法接受。

## 键盘关闭：Ctrl+W（2026-10-22 追加）

需求：笔记本当前标签页可用 `Ctrl+W` 快速关闭。

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 实现层级 | 窗口内 `window.keydown`（capture），不注册 `shortcutManager` | `shortcutManager` 走 `@tauri-apps/plugin-global-shortcut`，属系统级注册，会把 Ctrl+W 从所有其他程序手里抢走 |
| 作用域 | 仅 `currentView === "note"` | 标签条只存在于笔记视图；在待办/画布/协作文档里关后台笔记属于不可见的状态变更 |
| 关闭语义 | 与点击关闭按钮完全一致：静默落盘后关闭，无二次确认 | 额外确认框会让连按变得粘滞，且默认 `autoSaveInterval = 0` 时几乎总在脏态，确认框会变成噪音 |
| 最后一个标签 | 关到空状态即停，不隐藏窗口、不弹退出确认 | 与「关闭最后一个标签保留空状态」保持一致，避免「按了 Ctrl+W 程序消失」的惊吓 |
| 按键重复 | `event.repeat` 直接忽略 | 浏览器同样忽略自动重复；否则长按会一路关空整条标签栏 |
| 输入法 | `event.isComposing` 时忽略 | 中文输入过程中不打断组字 |
| 焦点 | 不限制焦点位置（编辑器、搜索框内均生效） | 限制焦点等于废掉这个快捷键——Ctrl+W 多半就是在编辑器里按的 |
| 屏蔽条件 | 存在 `[aria-modal="true"]` 或 `[data-shortcut-blocker]` 时不关标签 | 模态框（设置/关于/回收站/移动文件夹）与标签右键菜单打开时，关掉背后的笔记会让浮层指向一个已不存在的标签 |
| 右键菜单 | 菜单根节点标记 `data-shortcut-blocker`；菜单自身也在收到 Ctrl+W 时关闭 | 第一次 Ctrl+W 收起菜单、第二次才关标签，避免「菜单里的关闭其他」作用在已消失的标签上 |
| 可发现性 | 关闭按钮 `title`/`aria-label` 追加 `(Ctrl+W)`；右键菜单「关闭标签」右侧显示 `Ctrl+W` | 不写出来就等于没有这个功能 |

`preventDefault()` 无条件执行，避免 WebView2 后续版本把 Ctrl+W 解释成原生关闭。

## 顺带修复：连续关闭时的空内容回写

**问题**：切换笔记的保存路径用「缓冲区内容」写上一篇。快速连按两次 Ctrl+W 时，第二次关闭发生在新笔记 `loadNoteContent` 完成之前，缓冲区已被 `resetEditorContent("")` 清空，于是空字符串被当成 B 的内容写盘，B 的正文被截断。

**修复**：`NoteEditor` 新增 `loadedNoteIdRef`，记录「缓冲区当前属于哪篇笔记」，只在加载成功后赋值、activeNoteId 变空后清空。`persistPrevious` 仅在 `loadedNoteIdRef.current === prevId` 时写盘。

**理由**：`activeNoteId` 无法表达「内容是否已经就位」，而空白缓冲区既可能是「用户清空了笔记」（应保存），也可能是「新笔记还没读回来」（绝不可保存）。用显式标记区分这两种情况，比按脏标记或按内容长度推断更可靠。

**放弃**：在快捷键层加时间节流。它只是把窗口缩小，没有消除竞态，同一个 bug 仍可通过快速点两次关闭按钮触发。

## 待定 / 后续可选

- 键盘切换（`Ctrl+Tab` / `Ctrl+1..9`）未做。Ctrl+W 落地后已有先例：这类键位走窗口内 `keydown`，不进 `shortcutManager` 的全局注册。
- 设置页尚未列出 Ctrl+W；若要集中展示快捷键，需要在 `SettingsModal` 增加一段只读列表（目前那里只有 `toggleWindow` 可配置）。
- 标签栏与置顶窗（sticky）、只读瓦片（tile）的联动未做：这两个窗口有自己的渲染入口，不共享 `App` 的标签状态。
- 若后续要多视图混排（画布 / 协作文档进同一标签栏），需要先把 `ViewType` 改成页面实例路由，属于独立议题。
