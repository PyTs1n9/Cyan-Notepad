# 提示词：Qing Notepad 界面美化（0.6.2 开发分支 · P0/P1/P2 三批）

> 本文是可直接投喂给编码助手的执行提示词。它**派生自** `docs/decisions-ui-polish.md`，
> 冲突时以决策记录为准并回写修正本文。
> 目标读者：编码助手（执行）+ 项目所有者（复核）。执行者不需要此前对话的上下文，本文自包含。

---

## 一、任务目标

在不改变布局几何与信息架构的前提下，补齐 Qing Notepad 界面的三类缺口：

1. **可读性缺陷（P0，必须做）**——主题色上的文字对比度不达标，其中 danger 用于删除/退出等
   破坏性操作，属可用性缺陷；全局缺少键盘焦点可见样式；深色主题启动轻微白闪。
2. **纵深与质感（P1）**——三张浮卡只有单层微阴影，读起来像"贴在壳上"而不是"浮在上面"；
   缺少一处贯穿全界的表面质感（纸纹）作为品牌记忆点；品牌字无个性；导航栏指示器与
   按钮尺寸不自洽。
3. **一致性与打磨（P2）**——动效曲线散落 6 种、空态只有一行文字、滚动条偏重。

**交付判定**：三批全部落地后，任意主题下 `bg-accent/success/danger` 上的文字对比度 ≥ 4.5:1；
键盘可达的所有控件有可见焦点环；三张卡片有可辨识的纵深层次；表面有一层统一的纸纹质感。

---

## 二、背景信息

### 2.1 项目

- Windows 桌面应用，**Tauri v2 + React 19 + TypeScript + Tailwind CSS v4**。
- 样式集中在 `src/index.css`（约 1800 行，含 `@theme` 变量、磨砂、拖拽、画布、便签等模块）。
- 依赖里**已有** `motion` ^14.5.0（`motion/react`），已在 4 个组件使用，**不需要新增任何依赖**。

### 2.2 视觉体系（现状，不要推翻）

- 主窗口 = **三张浮卡**（左：图标栏 + 资源管理器 / 中：编辑器 / 右：AI 侧栏）+ 背景 gutter。
- 间距全部 **6px**：`SHELL_PAD_*` / `SHELL_GUTTER_*` / `SHELL_TOP_GAP_*` 都在
  `src/components/Layout/shellLayout.ts`，是**单一真源**，不得修改。
- `BOX_RADIUS = 10`。卡片类 `.shell-box`；磨砂类 `.surface-glass`（含 `--editor` / `--dialog` /
  `--light` 三个变体）。
- 主题：`blue`（默认，见 `settingsStore.ts:220`）/ `dark` / `yellow` / `green` / `custom`，
  通过 `.theme-*` 覆盖 `@theme` 里的 `--color-*`。
- 顶栏统一 `h-9` + 单条 `border-b`；**顶栏只有一个菜单（帮助）**，视图切换归 `ActivityBar`。
- 所有聊天/条带度量走**容器查询**，不是视口媒体查询。

### 2.3 三条必须尊重的既有实现事实

1. `.surface-glass::before` 用的是 **`background-color`**（不是 `background` 简写）
   + `backdrop-filter`，`z-index: -1`，因此**可以叠加 `background-image`** 而不互相覆盖。
2. 磨砂**只能放在 `::before`**：元素自身带 `filter`/`backdrop-filter` 会成为 `position: fixed`
   后代的包含块，而右键菜单、弹窗都渲染在卡片内部。`.app-root` 持有唯一的 `isolation: isolate`。
3. `tauri.conf.json` 的窗口配置是 `decorations: false` 且**没有 `backgroundColor`** → 首帧由
   Tauri 画白底。默认主题是 blue（浅色），所以**写死深色会让默认用户黑闪**。

---

## 三、具体要求

### 批次 P0｜可读性（先做，做完停下等确认）

#### P0-1 前景色 token

**改哪里**：`src/index.css` 的 `@theme`（第 50-68 行附近）与四个 `.theme-*` 块。

**怎么改**：

1. 在 `@theme` 中新增三个变量（必须写在 `@theme` 内，Tailwind v4 才会生成 `text-on-*` 工具类；
   只在 `.theme-*` 里定义是拿不到工具类的）：

```css
@theme {
  /* 其他变量保持不变 */
  --color-on-accent: #ffffff;
  --color-on-success: #052e16;
  --color-on-danger: #ffffff;
}
```

2. 各主题覆盖（**初值，必须用脚本实测后再定稿**）：

| 主题 | `--color-on-accent` | `--color-on-success` | `--color-on-danger` | 备注 |
|---|---|---|---|---|
| blue | `#ffffff` | `#052e16` | `#ffffff` | danger 底色 `#ef4444` 白字仅 3.76，**需压深**；实测定稿为 `#d42424`（白字 5.15、其 `/90` 悬停 4.63）。提示词初值 `#dc2626` 未算 `/90` 档，已作废 |
| dark | `#08090f` | `#052e16` | `#2a0a0a` | accent `#5c7cfa` 配深字 5.41；`accent-hover #4c6ef5` 实测 4.60 |
| yellow | `#2a2214` | `#16240f` | `#2e1512` | 低饱和莫兰迪配色，深字更协调 |
| green | `#0d2416` | `#06240f` | `#2b1212` | 同上 |

> 定稿取值与实测表见 `docs/decisions-ui-polish.md` 的 D11。

3. 替换约 40 处 `text-white`。**禁止全局 sed 替换**，必须逐处判定底色后改：

```
底色是 bg-accent / hover:bg-accent / bg-accent-hover  → text-on-accent
底色是 bg-success                                     → text-on-success
底色是 bg-danger / hover:bg-danger                    → text-on-danger
底色是 bg-black（AvatarCropper 全屏裁剪器）            → 保持 text-white
group-hover:text-white（关闭按钮悬停）                 → 改 text-on-danger
不是"色块上的字"而是别的用途                            → 不动，在报告里列出
```

已知分布（行号可能因其他改动漂移，以内容判定为准）：`NoteTree.tsx:795`、`Sidebar.tsx:220/229/294`、
`TitleBar.tsx:208/279/292/352`、`TodoView.tsx:683/715/742/835/942`、`TodoSidebar.tsx:427/540/617/688`、
`TodoStrip.tsx:138/278`、`TodoDescriptionCard.tsx:128`、`CanvasView.tsx:1765/1768/1816/2278`、
`CanvasToolbarMenu.tsx:115/167`、`CanvasTextToolbar.tsx:42/117`、`NoteEditor.tsx:758/779`、
`MarkdownViewSwitch.tsx:67`、`SettingsModal.tsx:948/1077/1288/1370/1515`、
`AuthModal.tsx:360`、`PasswordRecoveryModal.tsx:171/202/223/257/346`、
`AppDialog.tsx:129`、`Help/UpdateCheckModal.tsx:110`、`Settings/UpdateModal.tsx:55`、
`Settings/StorageSection.tsx:260`、`Settings/AvatarCropper.tsx:255/311`、
`AI/AiSidebar.tsx:249/316/987/1050`。

**注意 `AiSidebar.tsx:249/316`** 用的是硬编码 `bg-amber-*`，不属主题色，保持白字并在报告里说明。

**验收**：见第五节第 2 条。

#### P0-2 全局焦点环

**改哪里**：`src/index.css` 的 `@layer base`（第 471 行起）。

```css
@layer base {
  :where(button, a, input, textarea, select, [role="treeitem"], [tabindex]):focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  /* 滚动容器与横向 tab strip 内，正向 offset 会被裁掉 */
  [role="treeitem"]:focus-visible,
  .note-tab-strip button:focus-visible {
    outline-offset: -2px;
  }
}
```

**不要**动已有的 `.canvas-switcher-create:focus-within::after`、`.sticky-mode .sticky-content:focus`。
若某控件已有自己的 `focus:ring`，保留并确认不双重绘制（冲突时以既有实现为准，在报告里列出）。

#### P0-3 启动背景色

**前置**：先核实 `tauri::Window::set_background_color` 在当前 Tauri 2.12 是否存在、
签名与所需权限（查 `cargo doc` / 官方文档）。**不存在就停下报告，不要自创替代 API**。

**方案**（核实可用后执行）：

1. `src-tauri/src/` 新增模块（或并入现有 `storage.rs`）：
   - 命令 `set_window_background(hex: String) -> Result<(), String>`：校验 `^#[0-9a-fA-F]{6}$`，
     写入 `%APPDATA%/com.qing-notepad.app/window-bg.json`（`{ "color": "#rrggbb" }`），
     并调用当前窗口的 `set_background_color`。
   - `lib.rs` 的 `setup` 中读取该文件（缺失/损坏则忽略，不报错），在窗口创建后应用。
2. `src/App.tsx`：在主题应用 effect 里，把 `getComputedStyle(document.documentElement)`
   的 `--color-bg-primary` 解析成 hex，**仅在值变化时**调用该命令（不要每帧/每键调用）。
3. `src-tauri/capabilities/default.json` 补 `core:window:allow-set-background-color`
   （按实际 API 要求，先核实再写）。

> **执行结果**：API 可用（`set_background_color(Option<Color>)`）。实现走自有
> `invoke` 命令 `set_window_background`（`src-tauri/src/window_bg.rs`），**因此不需要**
> 任何 window 权限——`core:window:allow-set-background-color` 是 JS 侧调用 window API
> 才要的权限，本轮未添加。见 `docs/decisions-ui-polish.md` D3。

**降级**：API 不可用 → 在 `tauri.conf.json` 窗口配置加 `"backgroundColor": "#f0f4f8"`
（blue 的 `bg-primary`），并在报告与决策记录里登记降级原因。

### 批次 P1｜纵深与质感（P0 确认后做，做完停下等确认）

#### P1-1 双层阴影

```css
.shell-box {
  box-shadow:
    0 1px 1px color-mix(in srgb, #000 10%, transparent),
    0 10px 24px -14px color-mix(in srgb, #000 55%, transparent);
}
/* 暗底上黑影不可见：抬内高光 + 更远的投影 */
.theme-dark .shell-box {
  border-color: color-mix(in srgb, var(--color-border) 92%, transparent);
  box-shadow:
    inset 0 1px color-mix(in srgb, #fff 5%, transparent),
    0 12px 28px -16px #000;
}
```

保留 `.app-root.sidebar-resizing .shell-box { box-shadow: none }`（拖拽期降级，不要删）。

#### P1-2 纸纹

```css
.surface-glass::before {
  /* 保留原有 background-color 与 backdrop-filter，只追加 background-image */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
}
.theme-dark .surface-glass::before { /* 同一条 URI，把 rect 的 opacity 换成 0.022 */ }
/* 有壁纸时关闭：壁纸自带纹理，再叠会让画面显脏 */
.app-root[data-wallpaper="true"] .surface-glass::before,
.app-root:has(...) .surface-glass::before { background-image: none; }
```

**`hasBackground` 的判定方式由执行者按 `App.tsx:1103` 的现有实现选择**
（可用 `data-*` 属性或直接内联变量控制），但**必须只在有壁纸时关闭**，
`data-glass="off"`（磨砂关闭）时纸纹**应当保留**。

要求：噪点只在 `::before`（见 2.3 第 2 条）；`prefers-reduced-transparency: reduce` 下
可一并去掉（可选，做了要在报告里说明）。

#### P1-3 字体（带体积闸门）

- 为**品牌字**（`TitleBar.tsx:138` 的 "Qing Notepad"）与空态大标题引入一个 Latin 展示字体，
  **自托管**（放 `public/` 或 `src/assets/`，`@font-face` 引用），不得 CDN 外链。
- **只做 Latin 子集**，字符集限定字母、空格、数字、常用标点。中文正文继续用
  `"Segoe UI", "PingFang SC", "Microsoft YaHei"`，**不动**。
- **闸门：新增字体文件合计 ≤ 60 KiB**。超出即回退为纯系统字体方案，并在报告里写明
  实际体积与回退理由。选型需说明为何与"记事本 / 纸感"气质相符。

#### P1-4 ActivityBar 胶囊

- 选中指示器改为单个 `motion.span` + `layoutId="activity-indicator"`，同一时间只渲染一个；
  `useReducedMotion()` 为真时禁用过渡。
- 顶部四个按钮 `h-11` → `h-10`，与底部四个对齐。
- 现在的 `bg-bg-active` 色块 + 左侧 2px 条是双重编码，胶囊方案只保留胶囊 + 轻微发光
  （参考 `index.css` 里 `canvas-switcher-row--active` 的发光写法）。
- 不改变按钮顺序、图标、`title`/`aria-*`、`aria-current` 语义。

#### P1-5 标题栏波浪

`TitleBar.tsx:139-147` 每个字符 span：

- `hover:scale-125` → `hover:scale-110`；`hover:-translate-y-0.5` → `hover:-translate-y-px`；
- 加 `style={{ transitionDelay: `${index * 12}ms` }}`；
- 保留 `hover:text-accent`；
- `prefers-reduced-motion: reduce` 下取消位移与缩放（保留颜色变化）。

### 批次 P2｜一致性（P1 确认后做，做完停下等确认）

#### P2-1 动效 token

在 `:root` 定义并替换现存手写曲线：

```css
:root {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.2, 1.35, 0.38, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-slow: 280ms;
}
```

替换范围限于 `index.css` 内的 `transition` / `animation` 声明；`.tsx` 里的 Tailwind
`duration-*` 类可以保留。**逐条判断语义**（弹性入场用 `--ease-spring`，普通淡入淡出用
`--ease-out`），不要机械替换。

#### P2-2 EmptyState 组件

新增 `src/components/Layout/EmptyState.tsx`：

```tsx
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  hint?: string;        // 快捷键提示，等宽小字
  action?: { label: string; onClick: () => void };
}
```

接入位置：`NoteTree.tsx:902`（无笔记）、Todo 视图空态、搜索无结果、回收站为空。
**只做文字 + 图标 + 按钮，不做插画**（已排除）。文案必须走 `t(lang, ...)`，中英都要补 key。

#### P2-3 滚动条

- 先移除 `index.css:476-477` 的 `scrollbar-color` / `scrollbar-width`（Chromium 中
  `scrollbar-width` 会覆盖 `::-webkit-scrollbar`，不先移除则伪元素不生效）；
  或把它们收进 `@supports not selector(::-webkit-scrollbar) { ... }` 作为兜底。
- 重写：宽 6px、无轨道背景、thumb `color-mix(in srgb, var(--color-text-muted) 45%, transparent)`
  圆角 3px，容器 hover 时 78%，`transition: background-color 120ms`。
- 逐容器验证至少这五处：笔记树、编辑器正文、AI 侧栏、设置面板、画布。

---

## 四、输入输出格式

### 4.1 输入

- 本文件 + `docs/decisions-ui-polish.md`
- 仓库代码（样式真源 `src/index.css`；几何真源 `src/components/Layout/shellLayout.ts`）
- 无需其他上下文。

### 4.2 输出（每批一份，批次结束时给出）

**A. 代码改动**——最小 diff，不夹带无关重构、不格式化未触碰的行。

**B. 自检报告**——严格用下面模板，缺项视为未完成：

```
【批次】P0 / P1 / P2
【改动文件】
  - path:line  改了什么（一句话）
【自检】
  - tsc --noEmit: 0 error
  - npm run build: 通过 / 失败（耗时）
  - 对比度: N 组组合全部 ≥ 4.5（附实测表）
  - 体积: 新增字体 0 KiB / XX KiB
【对比度实测表】
  主题 | 底色 | 前景 | 用途 | 实测值 | 判定
【未验证项】
  - 明确列出无法在本机验证的行为（hover 动画、拖拽手感、真实窗口首帧等）
【偏差与判断】
  - 无 / 与提示词不一致之处 + 原因（必须显式声明，禁止静默改方案）
```

**C. 决策回写**——若实测推翻了本文的初值（例如某个 hex 达不到 4.5），
必须同时更新 `docs/decisions-ui-polish.md` 的对应条目，而不是只改代码。

### 4.3 交互约定

- **每批结束必须停下等确认**，不得连续执行三批。
- 发现本文假设与仓库实际不符（行号漂移属正常，按内容判定；**语义不符**必须停下报告）。
- 不允许"顺手"改本文未列出的视觉项，即使看起来更好。

---

## 五、约束条件

### 5.1 硬性禁止

1. **不改布局几何**：`shellLayout.ts` 的任何常量、`--shell-pad` / `--shell-gutter` /
   `--shell-top-gap` / `--box-radius` 全部不动（6px 节奏是已定不变量）。
2. **不改顶栏菜单结构**：顶栏只有帮助菜单，不得新增下拉或把视图切换搬回顶栏。
3. **不把 `filter` / `backdrop-filter` 放到卡片元素上**，只放在 `::before`。
4. **不新增根错误边界**；如需边界，扩展既有 `PanelErrorBoundary`。
5. **不新增依赖**（`motion` 已存在）；不引入 CSS-in-JS、动画库、图标库。
6. **禁止全局 sed 批量替换 `text-white`**，必须逐处判底。
7. **不碰** `data/` 目录、`.workbuddy/` 目录、`supabase/` 迁移文件。
8. `dev` 进程运行时**不得**执行 `npm install`（会撕裂提升包，报 EBUSY）。
9. `npm run build` 用 **PowerShell**，不用 Git Bash。

### 5.2 必须遵守

1. **本机无 GUI**：不得声称"已做视觉验证"。静态观感验证只能走
   build 产物 CSS + headless Chrome 截图 + 取样（参考 `.workbuddy/preview/glass-compare.html`）。
2. 所有新增用户可见文案走 `t(lang, key)`，中英 key 都补全。
3. 保留既有注释风格（解释"为什么"，不是"做了什么"）；新增 CSS 若涉及反直觉约束，
   必须写注释说明陷阱（如"::before only"、"scrollbar-width 优先"）。
4. 尊重 `prefers-reduced-motion` 与 `prefers-reduced-transparency`（后者已有实现，
   在 `index.css:463`）。
5. 类型检查用 `npx tsc --noEmit`；若被 PowerShell 执行策略拦截，跳过并在报告里说明，
   不要反复重试。

### 5.3 验收门禁

- `npx tsc --noEmit` 0 error、`npm run build` 通过——硬门禁。
- 对比度：每个"主题 × 色块-文字组合"实测 ≥ 4.5:1——硬门禁。
- 字体体积 ≤ 60 KiB——硬门禁，超出即回退。
- 视觉观感、动画手感、窗口首帧——**只能由项目所有者确认**，执行者只交付"待确认清单"。

---

## 六、已排除项（不要做）

| 项 | 理由 |
|---|---|
| 空态插画 / 手绘图形 | 已排除，只做文字 + 图标 |
| 中文正文字体替换 | 体积与构建成本不成比例 |
| 启动 Splash 画面 | 超出范围 |
| 布局几何、圆角、间距调整 | 已定不变量 |
| 顶栏菜单重构 | 已收敛，不得回退 |
| 画布、协作、AI 侧栏的功能性改动 | 不在本轮范围 |

## 七、待确认项（执行中遇到必须停下）

> **执行后状态：4 项全部关闭。** 结论见 `docs/decisions-ui-polish.md` 第 3 节。

1. `Window::set_background_color` 的 API 可用性与权限名（P0-3 前置）。→ 可用；自有命令，无需权限。
2. `--color-on-*` 的最终 hex（以脚本实测为准，初值仅方向）。→ 定稿见 D11。
3. 字体选型与体积（P1-3 闸门内选择）。→ Fraunces 600 Latin 子集，17.7 KiB。
4. `.sticky-content:empty::before` 的中文硬编码是否为死代码 → **不是**死代码（原生
   contentEditable，空笔记命中 `:empty`），已改为 `attr(data-placeholder)` + i18n key。
