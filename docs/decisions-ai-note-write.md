# 决策记录：AI 直接修改笔记（权限开关 + Tool Calling）

日期：2026-10-22
状态：已实施，构建通过（`npm run build`），检索冒烟 16/16 全中

## 需求

1. AI 助手对笔记具备修改权限：默认档「仅助手」只读问答；「完全开放」档允许 AI 直接修改笔记内容。
2. AI 的任何修改必须可撤销回退。
3. 权限开关放在输入栏、模型选择器右侧。

## 结论（grill 收敛）

| 主题 | 决定 | 理由 |
| --- | --- | --- |
| 权限模型 | 两档开关：默认「仅助手·只读」/「完全开放·可改笔记」 | 用户明确 |
| 撤销形态 | 每次 AI 写入前自动快照，对应助手消息上「撤销此次修改」，逐次回退 | 复用润色快照机制，成本最低；历史面板留作后续增强 |
| 修改范围 | 现有笔记正文 + 标题；不含新建/删除笔记，待办不纳入 | 删除风险高、撤销链路复杂 |
| 开关位置 | 输入栏内、模型选择器右侧（两档切换） | 用户指定 |
| 开启警示 | 切到「完全开放」时弹一次风险确认 | 防止用户忘记 AI 处于可写状态 |
| 追问强度 | 常规 | 用户未另行指定 |
| 撤销快照粒度 | 每条触发修改的助手消息一份快照，随会话清空即失效 | 与消息级撤销一一对应 |

## 选型（architect，2026-10-22 确认）

### 已核实官方事实

- Tool Calls：`deepseek-flash` 支持 tools/tool_calls（思考模式亦支持），strict mode 为 Beta（`base_url=https://api.deepseek.com/beta`）；Chat Completion API 不支持在历史中段插入非模型生成的 tool call（不影响正常循环）。https://api-docs.deepseek.com/guides/tool_calls
- JSON Output：支持 `response_format: json_object`，但官方注明「可能偶尔返回空内容」。https://api-docs.deepseek.com/guides/json_mode
- 计费：模型按 token 计费，tool calls 无单独费用项；API 费用 BYOK 用户自理（沿用既有决策，不比价）。https://api-docs.deepseek.com/quick_start/pricing

### 候选与决定

- 方案 A：编辑指令块（fenced block 解析）——零协议改动，但可靠性靠提示词约束，模型忘吐块即「静默不改」。
- **方案 B：Tool Calling 代理循环（选定）**——`ChatRequest` 扩展 tools，`openaiCompat` 解析流式 `delta.tool_calls`，`aiStore` 跑有限循环（≤3 轮工具往返）；工具 `update_note_content(noteId, content)` / `rename_note(noteId, title)`，执行侧统一走快照-应用-撤销写入服务。
- 方案 C：JSON 整包响应——撞上官方已知「偶发空内容」缺陷，且失去流式体验。

结论：采用方案 B。
理由：写入是高信任动作，修改意图须由协议层显式表达、noteId 由 schema 精确定位；额外成本只是每轮多一次往返。UI、快照、撤销管道三案共用，无浪费。回退预案：若某 OpenAI 兼容厂商不支持 tools，写入能力对该公司自动降级为不可用（仅问答）。

## 实现约定

- 权限开关状态 `noteWriteMode: "readonly" | "full"`，持久化于 `data/ai/preferences.json`（`StoredAiPreferences`）。
- 写入服务（新增 `src/utils/ai/noteWrite.ts`）：写前快照 → `noteStore.updateNote` + `saveNoteContent` → 打开中的笔记经事件通道重载（避免编辑器 buffer 覆盖）→ `markKnowledgeDirty()`（由 saveNoteContent 内建）。
- 撤销：按消息记录快照 id，消息级「撤销此次修改」按钮还原正文/标题并清标记。
- 完全开放档下写入**直接生效、无需逐次确认**；仅切换档位时一次风险确认。
- 小青（本地检索模式）无生成能力，永远只读；开关仅对 API 模型生效。
- system prompt 按档位切换口径（只读档明确「不修改笔记」；开放档注入笔记目录（id+标题）供工具定位）。
- i18n 中英双语新增词条。

## 待定问题

无。

## 实施结果（2026-10-22）

- 协议层：`chat/types.ts` 增加 `ChatToolCall`/`ChatTool`、`tool` 角色与 `tools`/`onToolCalls`；`openaiCompat.ts` 负责消息的线格式映射（`tool_call_id`/`tool_calls[].type`）与流式 `delta.tool_calls` 分片累积；`supportsTools` 进 `ChatProvider`（DeepSeek 预设置 true）。纯工具轮合法地无正文输出，空响应判定据此放宽。
- 写入服务 `src/utils/ai/noteWrite.ts`：三个工具 `read_note`（≤24000 字截断）/`update_note_content`/`rename_note`；统一写入路径 = `noteStore.updateNote` → `saveNoteContent`（内建 `markKnowledgeDirty`）→ `sticky:note-updated`（便签/磁贴跟随）→ `note:external-save`（主编辑器重载打开中的缓冲）。非打开中的笔记正文以磁盘为准（index.json 只存元数据）；打开中的笔记以 store 为准（镜像实时缓冲），避免覆盖未保存输入。
- 快照：`storage.ts` 新增 `saveNoteSnapshot/loadNoteSnapshot/deleteNoteSnapshot`（JSON，含标题+正文，存 `data/ai/snapshots/<noteId>/`）。撤销按消息逐条回退、逆序展开；快照缺失时不虚报「已撤销」。
- 会话持久化：`AiChatMessage.edits` 随会话存 `data/ai/chats.json`，重启后撤销仍可用（快照文件留在盘上）。
- 工具循环上限 3 轮（防循环调用空转）；权限档位 `noteWriteMode` 持久化于 `data/ai/preferences.json`，默认 `readonly`；小青（本地检索）永远只读，开关在本地模型下禁用。
- UI：开关为输入栏模型选择器右侧的两段式切换（仅助手/完全开放），切到「完全开放」弹一次确认；助手消息下挂修改记录 chip +「撤销此次修改」。
- i18n：`aiPerm*`/`aiEdit*` 系列词条中英双语。
- 知识库同步：`docs/user-manual.md` AI 节新增权限开关条目并修正上传范围表述（开放模式下改哪篇、哪篇全文才发给 DeepSeek）；`docs/user-faq.md` 新增 Q19。新增 `scripts/smoke-manual-bm25.mts`（`node --experimental-strip-types` 直跑 `manualEngine`），12 条示例问题 + 4 条权限问题 16/16 命中正确章节；期间修正了 Q19 标题措辞抢占「如何备份我的笔记？」top-1 的问题。

## 下一步

1. ~~协议层 / 写入服务 / aiStore / UI / i18n~~：已完成（2026-10-22）。
2. GUI 手测（需真实 Key）：开关切换与确认弹层、AI 改笔记即时生效、消息级撤销、打开中笔记的重载同步、便签/磁贴跟随、重启后撤销。
3. 后续增强（暂缓）：修改历史面板（浏览/回退任意版本）、新建/删除笔记工具、非 OpenAI 兼容厂商的写入降级路径。
