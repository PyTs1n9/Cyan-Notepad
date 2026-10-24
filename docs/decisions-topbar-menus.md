# 决策记录 · 顶部菜单（工具 / 传送门 / 帮助）改造

- 审计基线：v0.6.1，`src/components/Layout/TitleBar.tsx`（636 行）、`src/utils/portalActions.ts`、
  `src/components/Layout/ActivityBar.tsx`、`src-tauri/src/lib.rs`
- 审计口径：以「可上线」为标准，看职责归属、交互规范、异常处理、权限与可用性
- 记录方式：只记**已定**结论（结论 + 理由），未决项单列

---

## D1 · 改造边界 = 菜单 + ActivityBar + 视图 strip

**结论**：允许改动 TitleBar 三菜单、ActivityBar（48px rail）以及各视图的 ShellStrip 系组件；
不重做托盘菜单、不新建命令面板、不新建全局快捷键体系。

**理由**：三菜单的问题根源是同一批动作在菜单、ActivityBar、视图 strip 各有实现。只改菜单等于
在重复之上再叠一层，病根保留。命令面板与快捷键体系属于新的交互面，与本轮「收敛入口」目标不同，
先不做，避免范围爆炸。

---

## D2 · 传送门的性质修正：不是冗余层，是多个功能的唯一入口

**结论**：撤销「传送门属冗余、可整体删除」的初始判断。传送门**必须拆解，不能直接删**。

**理由（逐项反查证据）**：

| 动作 | 第二入口 | 证据 |
| --- | --- | --- |
| 导入笔记 | 无 | `onImportTextNotes` 仅传入 `TitleBar`（`App.tsx:1012`） |
| 导出笔记（md/docx/pdf） | 无 | `NoteEditor` 无导出按钮，只有保存/便签/撤销/链接/表格 |
| 新建分类 | 无 | 对话框内联在 `TitleBar.tsx:523-571` |
| 置顶便签 | 有 | `NoteEditor.tsx:664` |
| 创建 / 加入工作区、复制邀请 | 无 | 仅由 `WorkspaceView.tsx:292-305` 监听 `PORTAL_ACTION_EVENT` |
| 画布新建/图片/文字/适配/磁贴/导出 | 部分 | 画布自身工具栏另有入口 |

删除传送门会导致导入、导出、新建分类、工作区创建/加入/邀请五项功能直接消失，属功能回退。

---

## D3 · 传送门动作下沉到各视图 strip；传送门整块取消

**结论**：15 个动作按所属视图归位，传送门（`openMenu === "portal"` 分支、`portalViewMeta`、
`PortalActionButton` 组件）整体移除。跨视图派发机制 `portalActions.ts` 保留，继续作为 strip 与
视图内容之间的信道。

**理由**：动作与视图强相关，放在「当前视图」的容器里才符合心智；顶栏一级菜单不该随上下文变形
（现状下传送门的内容、宽度、标题每次打开都不同，无法形成稳定记忆）。

**副作用与对策**：笔记视图将首次拥有自己的动作 strip（承载新建笔记 / 新建分类 / 导入 / 导出 /
便签），需与 `TodoStrip`、`WorkspaceStrip` 统一到 `Layout/ShellStrip.tsx` 的同一套视觉。

---

## D4 · 帮助菜单必备三项

**结论**：改造后的帮助入口必须包含：使用手册 / 常见问题、检查更新（一级化）、快捷键一览。

**理由**：
- `docs/user-manual.md` 与 `docs/user-faq.md` 已经在仓库内并被 AI 检索（BM25 + 向量）消费，
  但界面上零入口——产品自己写了手册，用户拿不到。
- 「检查更新」现在埋在 帮助 → 关于 → 弹窗自动检查 两级之后，失败只显示「检查更新失败」，
  没有原因与重试路径。
- 应用内没有任何加速键提示（`AppShortcuts` 只有 `toggleWindow` 一项可配置），快捷键一览是
  现阶段唯一的可发现性补丁。

---

## D5 · 存在存量用户 ⇒ 入口变更必须可迁移

**结论**：本次改造按「有存量用户」处理：保留旧路径一个版本周期、发布说明列出入口迁移对照、
删除的入口不得伴随功能删除。

**理由**：产品已发布到 0.6.1，关于弹窗内含 QQ 群（902898359）与博客站点，说明存在对外分发渠道。
用户的肌肉记忆依赖顶栏文字入口，一次性移除会直接表现为「功能不见了」。

---

## D6 · 视图切换：ActivityBar 唯一，顶栏不承载

**结论**：删除「工具」菜单，顶栏不显示当前视图名，ActivityBar 四个图标是唯一切换源。

**理由**：两处入口共享 `currentView`，任何一处遗漏都会造成状态不一致；顶栏再放一个只读视图名
等于为一个已有高亮态的信息再开一块位置。ActivityBar 已具备 `aria-current`、`title` 与选中竖条。

**验收要求**：ActivityBar 四个图标必须有可读标签（tooltip + `aria-label`），并在首次启动引导中
出现一次文字说明，否则纯图标会让新用户找不到笔记视图。

---

## D7 · 设置入口保留两个（齿轮 + 帮助菜单），但必须同源

**结论**：ActivityBar 齿轮与帮助菜单的「设置」都保留，两处一律经 `App.openSettings(section?)`
单一通道打开，不得各自实现。

**理由**：用户选择保留双入口以降低丢失风险。历史上 `SettingsModal` 的 section 深链就是靠这条
通道统一的（`initialSection`），继续沿用可避免第二套开关状态。

---

## D8 · 「退出应用」迁入头像弹窗，并要求二次确认

**结论**：从帮助菜单底部移除，放进头像弹窗（与「退出登录」并列），点击后弹一次确认。

**理由**：退出属会话级动作，与账户动作同族；同时修复现状的语义倒置——窗口 X 因 close-to-tray
不退出，真正的退出反而无确认、无提示。托盘右键的 Quit 保留，同样补确认。

---

## D9 · 新增「报告问题」入口，指向 GitHub Issues

**结论**：帮助菜单新增一项，复用 `AboutModal` 已有 `GITHUB_URL` 常量与 `openInDefaultBrowser`。

**理由**：应用内当前零反馈通道。复用既有常量与外链工具，零新增依赖、零新增权限。

---

## 待定

- [ ] 「快捷键一览」的实现范围：应用内加速键散落在 `NoteEditor` / `CanvasView` 的 keydown 分支，
      无集中清单，需先盘点再决定是静态表还是从注册表生成（依赖 D10 的动作注册表）
- [ ] 动作注册表落地后，各视图 strip 的宽度预算（笔记 strip 新增 5 个动作，需验证 620px 容器断点）
- [ ] 旧入口迁移提示的呈现形式（一次性 toast vs 发布说明）

## 附 · 缺陷清单（改造验收用）

**A 职责与信息架构**
1. 「工具」菜单 = 视图切换，与 ActivityBar 四图标 100% 重复，无任何真实工具（`TitleBar.tsx:285-315` vs `ActivityBar.tsx:30-35`）
2. 「帮助」菜单混装 设置 / 关于 / 退出应用，语义错位（`L424-440`）
3. 「传送门」随 `currentView` 变形，无稳定身份（`portalViewMeta`，`L250-257`）

**B 交互规范**
4. 同级三菜单三种形态：172px 列表 vs 304px 双列卡片 + 头部 + `<details>` 折叠
5. 无 menubar 键盘模型：无方向键、无 roving tabindex、打开不聚焦、关闭不还焦，仅 Esc（`L149-156`）
6. 工具 / 帮助缺 `role="menu"`、`aria-haspopup`、`aria-expanded`；菜单项为裸 `button`（仅 `L62` 有 `role="menuitem"`）
7. 菜单已开时鼠标滑过相邻菜单不切换（与原生菜单预期相反）
8. 无加速键显示；`AppShortcuts` 仅 `toggleWindow`（`settingsStore.ts:77-83`）
9. 三个菜单均 `absolute left-0 top-full`，无碰撞检测，窄窗口下 304px 面板溢出边界

**C 状态与异常**
10. disable 无原因；`disabled` 元素在 Chromium 不派发鼠标事件，`title` tooltip 实际不出现（`L63-70`、`L354`、`L368-373`、`L381-383`）
11. 动作派发 fire-and-forget，无回执 / pending / 失败提示（`portalActions.ts:22-24`）
12. `quit_app` / `toggleMaximize` / `close` 三处 `invoke` 无 `catch`（`L167-174`）
13. 「退出应用」无二次确认（`L435`），且与窗口 X（close-to-tray）破坏力在 UI 上倒置
14. 检查更新两级埋藏，失败无原因与重试说明（`AboutModal.tsx:169-174`）
15. 托盘菜单硬编码英文 `Show Window` / `Quit`（`lib.rs:60-61`），不随语言切换
16. 未登录时工作区分支仅「登入」，无价值说明；只读角色 disable 无解释

**D 可维护性**
17. `TitleBar.tsx` 636 行 = 菜单 + 两个内联对话框 + 窗口控制；动作硬编码为 JSX，无数据结构，
    快捷键 / 搜索 / disabled-reason / pending 态无处可挂
18. `openMenu: string | null`（`L121`）无类型约束

---

## D11 · 审计修正与实施结果（收口，以代码为准）

### 修正：D2 的「8 个唯一入口」是错的，实际只有 2 个

初判表格把「创建/加入工作区、新建云文档、权限管理、复制邀请、新建分类」也列为唯一入口，**不成立**。
反查方法有缺陷：按 portal action id（`create-workspace` 等）grep，只能查到监听 `PORTAL_ACTION_EVENT`
的地方，漏掉了侧栏自己走 `stores/workspaceUi.ts#openDialog` 的并行通道。

| 动作 | 实际第二入口 |
| --- | --- |
| 创建 / 加入协作空间 | `WorkspaceSidebar.tsx:632-649` → `openDialog("createWorkspace"/"joinWorkspace")` |
| 新建云文档 | `WorkspaceSidebar.tsx:445-460`（`canEdit` 时） |
| 权限管理 | `WorkspaceSidebar.tsx:427-435` → `workspaceUi.openManage("permissions")` |
| 复制邀请 | `WorkspaceView.tsx:747-754`（权限面板「工作台设置」页签内） |
| 新建分类 | `Sidebar.tsx:131-138`（内联重命名，优于被删的对话框） |
| 画布六项 | `CanvasView.tsx` 工具栏（新建 2237、插图 1780、插文字 1781、适配 1897、磁贴 1938、导出 1942） |

**真正只有传送门能到达的只有 2 个**：导入笔记、导出笔记。

教训（写进流程）：判断「某入口是否冗余」时，grep 的依据必须是**用户可见动作**，不是内部事件 id；
内部信道往往有多条并行实现。

### 实施结果

删除：`TitleBar` 的工具菜单、传送门整块、帮助下拉、`PortalActionButton`、`portalViewMeta`、
新建分类对话框（`TitleBar` 由 636 行降至约 340 行）。
新增：`Layout/DropdownMenu.tsx`（全应用唯一下拉，224 定宽 + flip + 键盘模型 + disabled 原因）、
`Help/HelpMenu.tsx`、`Help/HelpCenterModal.tsx`（手册 / 常见问题 / 快捷键 / 画布使用说明四页签）、
`Help/UpdateCheckModal.tsx`（四态 + 失败原因 + 重试）、`utils/shortcutReference.ts`。
迁移：导入 → `Sidebar` 树头 FileUp；导出 → `NoteEditor` 工具栏 FileDown；退出应用 → 头像弹窗 +
二次确认 + 退出前 `flushActiveNote`；托盘文案 → `set_tray_language` 随语言切换。
收敛：`PortalAction` 由 17 个成员裁至 `"new-todo"`；4 个视图里已不可达的监听全部删除；
`AboutModal` 去掉重复的检查更新；`index.css` 删除旧文字菜单死 CSS。

校验：`tsc --noEmit` 0 error；`cargo check` exit 0；`smoke-manual-bm25` 17/17；
20 个旧动作 + 4 个视图切换 + 未登录登录入口逐个溯源，全部有可达替代入口（QA `PASS 21/22`，
唯一 FAIL 为死 CSS，已修；回归 `PASS 9/9`）。

**未做**：GUI 视觉验证（本机无 GUI）；无组件级单测（仓库无测试框架，未为此新增依赖）。

### 范围外，需单独决策

- ~~`src-tauri/capabilities/default.json` 的 http 白名单~~ → **已收窄（2026-10-24，经用户确认）**：
  由 `https://**` / `http://**` 改为 **https 任意 + http 仅回环与 RFC 1918**（22 条 URLPattern）。
  写入前用 Node 的 `URLPattern` 实测了三条语义，直接决定了配置形状：
  1. 端口是独立组件，`https://**` **不匹配** `https://host:8443`，裸形式与 `:*` 形式必须并存；
  2. `http://localhost:*` / `http://127.0.0.1:*` 不会被 `localhost.evil.com` 绕过，回环可以放心收紧；
  3. 主机名通配符**跨点**，`http://192.168.*:*` 也命中 `http://192.168.1.5.example.com`；且 IPv6 字面量
     （`http://[::1]:*`）在 URLPattern 里构造失败，故 IPv6 回环端点不受支持。
  残留风险（已写入配置 description）：刻意构造的、以 `192.168.` 之类开头的**域名**仍能通过私网段
  glob。接受该残留——它仍挡住了全部公网明文 IP 与普通域名；要彻底消除只能把 http 限制为纯回环，
  代价是局域网里的 Ollama / LM Studio（多为 http-only）全部不可用。
  验证：22 条模式全部可构造；13 个探针符合预期（`169.254.169.254`、`172.32.x`、`8.8.8.8`、
  `localhost.evil.com` 均被拒）；`cargo check` exit 0（能力标识与 schema 通过编译期校验）。
- `docs/user-faq.md` 的 Q20（联网搜索）被整块删除，与 `src/utils/ai/search/*` 删除一致，
  但使 FAQ 块数 20 → 19，属既有 AI 改动的结果。
