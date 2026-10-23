# 决策记录：AI 模块优化（2026-10-23）

审查强度：拷打（用户选定）。范围：功能补齐 / 性能与流畅 / 界面与观感 / 可靠性与安全
四方向全选；代价边界＝不增安装体积、可加轻依赖（本轮实际未新增依赖）。
审查对象：`src/stores/aiStore.ts`、`src/components/AI/*`、`src/utils/ai/**`，
以及既有 5 份 `docs/decisions-ai-*.md`。

## 结论 1：先立基线，再谈优化

结论：任何"优化"必须带前后可比的数字；本轮先落地可离线测的两项，其余指标取决于 GUI 手测。

已测（2026-10-23，`node --experimental-strip-types`，语料＝手册 + FAQ）：

| 指标 | 基线值 |
| --- | --- |
| `smoke-manual-bm25.mts` top-1 命中 | **21/21** |
| 手册+FAQ 语料规模 | 35 chunk / 5,499 字 |
| `createManualIndex` 构建 | **3.2 ms** |
| BM25 单次查询 | **0.042 ms** |

理由：这三个数字说明"检索的 CPU 侧不是瓶颈"——BM25 建索引与查询都在毫秒以下，
用户感知到的等待只可能来自**笔记/画布的磁盘读取**与**embedding 批处理**。
不做基线就会把"冷启动慢"误判成"算法慢"，去优化 Float32Array 之类的无效项。

未覆盖（需 GUI 手测，本轮环境无 GUI）：首 token 延迟、长会话流式帧率、混合检索召回质量。

## 结论 2：修正审查结论——原始 HTML 已被转义，真正的洞是 URL scheme

结论：`markdownRenderer.html` 早已把原始 HTML 全部转义（`markdown.ts:103`，
实测 `block`/`inline` 两种 `<img onerror>` 都输出为实体），因此"可执行 HTML 注入"
这一条 P0 判断不成立，撤回。**真正的注入面是链接与图片的 URL 协议**：
`marked` 把 `href` 原样写进 DOM，`[点我](javascript:alert(1))` 在 webview 里点击即执行，
而 Tauri IPC 暴露在同一 origin 上。

处置：`markdown.ts` 增加协议白名单——链接只放行 `http/https/mailto/tel`、
相对路径与锚点；图片只放行 `http/https/blob/attachment/data:image/*`。
不在白名单内的链接**保留文字、去掉 href**，图片降级为 alt 文本。

理由：零依赖、零体积（DOMPurify 3.2.6 为 20.45KB min / 8.38KB gzip，本轮不需要）；
不动笔记路径的既有 HTML 语义。

## 结论 3：流式重渲染——改订阅粒度，不改进度条

结论：`AiSidebar` 的 `useAiStore()` 全量订阅改为逐字段 selector；消息列表抽成
`MessageList`（自己订阅 `messages`）；单条消息抽成 `MessageRow` 并 `React.memo`；
`AssistantBubble` / `ReasoningBlock` 同样 memo。

理由：`aiStore` 每个 delta 都会 `messages.map(...)` 生成新数组，全量订阅因此让整个面板
（头部、历史弹层、输入胶囊）随 token 重渲染。拆开后，一次 token 只重渲染"正在增长的那一条"，
历史行因对象引用不变被 memo 跳过。

## 结论 4：会话落盘改分片，一次一轮只写一个会话

结论：`data/ai/chats/<id>.json` 一会话一文件；旧 `data/ai/chats.json` 首次加载时迁移并删除。

理由：旧实现每轮把**全部**会话（含每条消息里检索到的 chunk 全文）序列化写盘，
成本与会话数成正比；分片后一轮写入只与该会话长度有关，且单文件损坏只影响一个会话。

迁移安全：先写分片、再逐个 `exists` 校验，全部存在才删除旧文件。

## 结论 5：本轮不做（反向清单）

| 项 | 不做的理由 |
| --- | --- |
| 向量 `number[][]` → `Float32Array` | 1000 chunk × 512 维 ≈ 51 万次乘加，毫秒级；基线已证明 CPU 不是瓶颈 |
| 检索与生成并行 | 检索结果是 prompt 输入，结构上无法并行；收益只能靠"阶段可见"文案 |
| 端侧小模型给小青做生成 | 与"不增体积"既定边界冲突 |
| 每厂商独立 Key 管理 UI | 与"修好单 Key 校验"是两个议题 |

## 结论 6：第二批（2026-10-23 已实施）

1. **`verifyKey` 不再硬编码 DeepSeek**：校验目标改为下拉框当前选择的 provider；选「小青」（无 Key 的
   本地模式）时退回润色模型对应的 provider。理由：原实现永远打 DeepSeek 端点，接第二家厂商时填任何
   其他 Key 都会误报 401，决策 #11 的扩展位实际不可用。
2. **首问冷启动预热**：`vectorIndex.ts` 新增 `scheduleChunkWarmup` / `runChunkWarmup`，索引重建后
   用 `requestIdleCallback`（无该 API 时 600ms 兜底）分批预 embed chunk 向量；模型尚未 ready 时排队，
   ready 后自动开始；检测到有真实查询在飞时让路。理由：冷启动的最大单项成本是"首个问题替整个语料付
   embedding"，基线已排除 CPU 因素。
3. **阶段可见**：消息新增 `phase`（`retrieving` / `searching` / `thinking` / `writing`），
   `sendMessage` 出气泡即置 `retrieving`，检索完置 `thinking`，联网前置 `searching`，执行工具前置
   `writing`。占位气泡文案随阶段变化（新增 3 条 i18n）。理由：四种等待此前共用一组 typing dots，
   用户无法区分"本地索引慢"与"网络卡住"。
4. **来源可验证（重开 2026-10-22 定稿）**：回答下方追加一行来源 chip（站点名或域名），点击经
   `openInDefaultBrowser` 走系统浏览器，不在 webview 内导航。采用最小形态：不加来源卡片、不加逐句
   角标。重开依据：用户在 2026-10-23 明确要求"从第一项往下做"，其中包含本项。
5. **写笔记的撤销与 diff**：新增输入框上方 5 秒可撤销条（`EditUndoBar`）；编辑 chip 可点开
   `NoteEditDiff`，按需读取编辑前快照与当前正文做行级 diff。保持"直接落盘、不强制确认"，因为每次
   工具调用都弹确认会打断 agent 循环。diff 上限 400 行（`computeLineDiff` 是 O(n·m)），超限显式提示。
6. **截断可见**：`maxTokens` 2048 → 4096（思考 token 与正文共用预算）；适配器新增
   `onFinish(finish_reason)`，`"length"` 时消息标 `truncated` 并在气泡下提示，不再把截断的回答
   当完整答案展示。

## 待定问题

1. 来源可见性是否重开（结论 6 第 4 项）——需要用户明确推翻 2026-10-22 的定稿。
2. 会话条数上限与自动标题（当前标题＝首问前 30 字）。
3. 失败回合的重试语义：现有按钮是"重新生成"（RotateCcw），不是"重试本次"。
4. 思考阶段是否暴露检索命中的 chunk 标题（透明性 vs 界面噪声）。

## 实施结果（2026-10-23）

- `src/utils/markdown.ts`：新增 `isSafeLinkHref` / `isSafeImageSrc` 与 `link` renderer 覆盖；
  `image` renderer 增加 src 校验。导出两个判断函数便于单测/复用。
- `src/components/AI/AiSidebar.tsx`：`useAiStore()` 全量订阅 → 逐字段 selector（状态 8 个 + 行动作经
  `getState()` 读一次）；新增 `MessageRow`（memo）/ `MessageList`（订阅 `messages`）；
  `AssistantBubble`、`ReasoningBlock` 改 memo；`MessageActions` 改 selector。
- `src/utils/storage.ts`：`loadAiConversations` 读分片 + 迁移；新增 `saveAiConversation` /
  `deleteAiConversation`；移除 `saveAiConversations`。
- `src/stores/aiStore.ts`：`syncConversations` 只写当前会话分片；重命名/删除/清空走单文件操作。
- 验证：`npx tsc --noEmit` 通过；`npm run build` 通过（9.19s）；`smoke-manual-bm25.mts` 21/21。
- 未验证：GUI 手测（流式渲染、会话切换/迁移、链接拦截的真实点击行为）。

## 实施结果（第二批，2026-10-23）

| 文件 | 改动 |
| --- | --- |
| `src/utils/ai/chat/types.ts` | `ChatRequest` 新增 `onFinish(reason)` |
| `src/utils/ai/chat/openaiCompat.ts` | SSE 与非流式路径均解析 `finish_reason` 并回调 |
| `src/utils/ai/vectorIndex.ts` | `scheduleChunkWarmup` / `runChunkWarmup`，idle 预热，ready 后自动补跑，查询在飞时让路 |
| `src/utils/ai/knowledgeRetrieval.ts` | 索引重建后触发预热 |
| `src/utils/storage.ts` | `StoredAiChatMessage` 增加 `sources` / `truncated` |
| `src/stores/aiStore.ts` | `MAX_ANSWER_TOKENS = 4096`；`MAX_ANSWER_TOKENS` + `onFinish` 标记 `truncated`；`phase` 生命周期；`sources` 落盘；`verifyKey` 按选中 provider 校验 |
| `src/components/AI/AiSidebar.tsx` | `PHASE_LABEL_KEY` 阶段文案、来源 chip（系统浏览器打开）、截断提示、`NoteEditDiff`（按需读快照 + 400 行上限）、`EditUndoBar`（5 秒） |
| `src/utils/i18n.ts` | 新增 `aiPhaseRetrieving` / `aiPhaseSearching` / `aiPhaseWriting` / `aiTruncated` / `aiViewDiff` / `aiDiffTooLong` / `aiDiffUnavailable`（中英） |

验证：`npx tsc --noEmit` 通过；`npm run build` 通过（9.63s）。
未验证：阶段切换时序、来源链接拉起浏览器、撤销条计时、diff 面板在长笔记上的实际耗时、预热对首问延迟的
真实改善——均需 GUI 手测。
