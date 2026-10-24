# 计划：AI 能力扩展路线

日期：2026-10-23
状态：第一波已确认范围，未动代码

目标口径：「多样性」指用户能感知到的**新入口与新产物形态**，不是把官方 API 全部接一遍。
每条能力都必须回答一个问题：它让用户在笔记软件里多做到哪件原本做不到的事。

---

## 0. 不可动的约束前提

这些是既定结论，本计划不重开：

| 约束 | 来源 |
| --- | --- |
| BYOK，密钥只存 `data/ai/credentials.bin`（DPAPI），应用不代理、不转售 token | `decisions-ai-integration.md` |
| 安装包体积是开发者侧唯一成本指标（当前 +~51MB 来自 bge + onnx） | `MEMORY.md` |
| 语料本地闭环：云端工作区文档、回收站不入索引 | `MEMORY.md` |
| 小青本地模式永久只读，开关锁定 | `decisions-ai-note-write.md` |
| 不做端侧生成模型、不做每厂商 Key 管理 UI | `decisions-ai-optimization.md` 结论 5 |

新增能力一律默认**走服务端、不增加安装包体积**。

---

## 1. 能力缺口盘点

官方能力 vs 当前接线（`grep` 实测，`src/` 内零命中的标 `—`）：

| 官方能力 | 当前状态 | 缺口性质 |
| --- | --- | --- |
| Chat Completions + 流式 | 已用 | — |
| Tool Calls | 已用（3 个笔记工具） | 面窄 |
| Context Caching | 自动生效，未针对前缀结构优化 | 可优化 |
| Search API | 已用（联网问答） | 只读问答 |
| **Fetch API** | — | 未接线 |
| **视觉输入** | — | 未接线 |
| **JSON Output** | — | 未接线 |
| **thinking / reasoning_effort** | — （依赖默认：开 + high） | 未接线 |
| **FIM / 前缀续写** | — | 未接线 |
| strict tool calls | — | 未接线 |
| Responses / Anthropic 兼容层 | — | 内置场景无收益，不建议接 |
| Files API | — | 仅服务视觉，随 A3 决定 |

---

## 2. 候选能力

工作量记号：S ≤ 半天，M ≈ 1–2 天，L > 2 天（含 UI 与联调）。

### A 组 · 已开放但未接线的官方能力

| 编号 | 能力 | 用户多做到什么 | 动哪里 | 量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| A1 | thinking 开关 + effort 档位 | 简单问答不再等思考、不再被推理吃掉 4096 预算 | `ChatRequest` 加 `thinking`/`effort`；`openaiCompat` 落字段；设置页加档位 | S | thinking 模式忽略 `temperature`，UI 需说明 |
| A2 | JSON Output | 结构化产物：一键抽待办、生成标签、出摘要卡 | 新增 `utils/ai/structured.ts`，`response_format: json_object` | S | 官方注明**偶发返回空 content** → 只用于辅助产出，绝不用于写笔记 |
| A3 | 视觉输入 | 截图 / 白板照片 / 纸质稿 → 直接成笔记 | `ChatMessage.content` 支持 `image_url` 块；输入栏加粘贴与拖拽；Files API 可选 | M | **仅 flash 支持，pro 不支持** → 必须按能力路由模型 |
| A4 | Fetch API | 网页剪藏：贴链接 → 正文转 Markdown 存为新笔记 | 复用 search provider 的 HTTP 层，新增 `fetch` 方法 | S | 依赖目标站点可用性；$0.75/千次按成功计费 |
| A5 | 缓存前缀优化 | 多轮长对话成本与首字延迟下降 | 重排 prompt：稳定 system/手册在前，检索片段与问题在后 | S | 无功能变化，只有账单与延迟变化 |
| A6 | FIM 补全 | 编辑器内 Tab 补全（真正的"写作时"AI） | 新增 `ChatProvider.complete()`（`/beta/completions`）+ 编辑器 ghost text | L | beta base_url、仅非思考模式、单次 4K 上限；每次击键都是计费请求 |

### B 组 · 工具面扩张（沿用 `noteWrite.ts` 既有模式）

| 编号 | 能力 | 用户多做到什么 | 量 | 风险 |
| --- | --- | --- | --- | --- |
| B1 | 待办工具（增/改/完成/优先级） | 「把这段整理成待办」真正落库，而非只给文本 | M | 需要第三档权限或明确并入现有档位 |
| B2 | 画布工具（写入文本卡） | 大纲/脑暴直接落在画布 | L | 画布结构与撤销链路比笔记复杂 |
| B3 | 新建 / 删除笔记 | 归档、拆分长笔记 | S–M | **删除必须走回收站 + 二次确认**，否则不立项 |
| B4 | 标签与分类 | 批量打标、自动归档到文件夹 | S | 与 `noteStore` 分类轴耦合，需确认覆盖范围 |
| B5 | strict tool calls | 参数不再解析失败（少一轮重试） | S | 需 `base_url=/beta`；schema 要求全字段 required + `additionalProperties:false` |

### C 组 · 交互形态（不依赖新 API，纯产品面）

| 编号 | 能力 | 用户多做到什么 | 量 |
| --- | --- | --- | --- |
| C1 | 选区动作菜单（改写/续写/摘要/翻译/转待办） | 现在只有「润色」一个动作，扩成一组，是**多样性感知最强**的一项 | S |
| C2 | `@` 引用笔记 | 显式指定上下文，替代"检索碰运气" | M |
| C3 | 内联补全 ghost text | 见 A6 | L |
| C4 | 结构化产出（表格 / 大纲 / 复习卡） | 笔记从纯文本变成可复用素材 | S |
| C5 | 跨笔记批量重构 | 大范围整理 | L，风险最高，暂不建议 |

### D 组 · 多模型（注册表已有扩展槽，目前只有 DeepSeek 一个）

| 编号 | 能力 | 量 | 说明 |
| --- | --- | --- | --- |
| D1 | 增加 OpenAI 兼容预设（Kimi / GLM / Qwen / Ollama） | S | 每厂商 = 一个 preset 文件 + `chat/index.ts` 一行 |
| D2 | 任务级路由（问答 / 润色 / 写入各选模型） | M | 现只有 `chatModel` + `polishModel` 两个槽 |
| D3 | 能力声明式路由（有图必走 flash） | S | `ChatProvider` 加 `supportsVision` 等声明，调用侧按需回退 |

---

## 3. 建议分三波

**第一波 · 低成本高感知（不改写权限模型）**
A1 + A5 + C1 + A2
理由：前三项直接改善每一次对话的体验与账单；C1 是用户最容易看见的"变多样了"；A2 为后续结构化产物铺路。全部落在既有接缝内，不动写入链路。
D1（多模型预设）本身独立，可随时插入，不阻塞本波。

**第二波 · 输入形态扩张**
A3（视觉）+ A4（网页剪藏）+ D3
理由：这两项把输入从"纯文本"扩到"图片"和"网页"，是使用场景的真实增量，且服务端完成、不增体积。必须先做 D3，否则用户选了 pro 就会出现"传图报错"。

**第三波 · 写入权限扩张（需新的信任设计）**
B1 + B4 + B5，B3 单独评审
理由：现有「完全开放」的信任模型是"先快照、事后撤销"，对笔记正文成立；对**删除**不成立，必须先有回收站路径 + 二次确认，再谈立项。

---

## 4. 反向清单（明确不做）

| 项 | 理由 |
| --- | --- |
| Responses API / Anthropic 兼容层 | 是给别人家 CLI 当后端用的，内置 BYOK 场景零收益 |
| Files API 独立功能 | 只服务视觉且是优化项，随 A3 顺带决定即可 |
| MCP / 插件市场 | 与"本地优先的小型笔记软件"定位冲突，攻击面远超收益 |
| 端侧生成模型 | 违反不增体积边界（既有结论） |
| 每厂商独立 Key UI | 既有结论 5 已否决 |
| `code_interpreter` / `computer_use` | 官方明确不支持 |

---

## 5. 待定问题

1. ~~「多样性」指的是入口更多还是能力更深？~~ **已定：先做入口（第一波 = A1 + A5 + C1 + A2）。**
2. 是否接受为视觉单独固定用 `deepseek-flash`（牺牲 pro 的推理质量）？—— 第二波再定。
3. B1 待办写入是并入现有两档，还是开第三档「可写待办但不可写笔记」？—— 第三波再定。
4. A6 内联补全会产生"每击键一次请求"的持续费用，是否需要节流策略？—— 随 A6 立项时定。

---

## 6. 已确认（2026-10-23）

| 主题 | 决定 | 理由 |
| --- | --- | --- |
| 第一波范围 | A1 + A5 + C1 + A2 | 用户选定"体验入口组合"：不动写入链路，当天可见差别 |
| A1 默认档位 | `thinking` 默认 `low`，可上调，也可关闭 | 用户选定。折中方案：保留少量推理，长任务不易翻车，同时显著缓解"推理吃满 4096 导致正文被截断" |

### 第一波落地清单（按依赖排序）

1. **A1** | `ChatRequest` 加 `thinking?: "enabled" \| "disabled"` 与 `reasoningEffort?: "low" \| "high" \| "max"`；
   `openaiCompat.ts` 请求体落这两个字段；`data/ai/preferences.json` 落默认值 `low`；设置页给三档（关 / low / high）。
   注意 `thinking` 需作为顶层字段发送（OpenAI SDK 走 `extra_body`，本项目直接 `JSON.stringify`，无需包装）。
2. **A5** | 重排 `aiStore.runGeneration` 的 prompt：稳定 system 在前不变，检索片段与网页结果移到历史之后、问题之前。
3. **C1** | 把 `polish.ts` 的单一动作扩成动作表（改写 / 续写 / 摘要 / 翻译 / 转待办），
   `AiPolishPanel` 变成动作选择器；每个动作 = 一段 system prompt + 输出约束，不改写入链路
   （写回仍走编辑器 `apply`，校验原文未变）。
4. **A2** | 新增 `utils/ai/structured.ts`，`response_format: json_object` + "json" 关键词与示例；
   首个消费方为 C1 的「转待办」与笔记摘要卡。**空 content 时回退到纯文本路径**，不向用户报错。

验收口径：`npx tsc --noEmit` 通过；`scripts/smoke-manual-bm25.mts` 仍 21/21；GUI 行为（流式、选区块、补全面板）本机无法验证，需你手测。

---

## 7. 实施结果（第一波，2026-10-23）

| 文件 | 改动 |
| --- | --- |
| `utils/ai/chat/types.ts` | `ThinkingLevel`；`ChatRequest` 增 `thinking` / `reasoningEffort` / `responseFormat`；`ChatMessage.reasoning`；`ChatProvider.supportsThinking` |
| `utils/ai/chat/openaiCompat.ts` | 请求体落 `thinking:{type}`、`reasoning_effort`、`response_format:{type:"json_object"}`；assistant 消息回传 `reasoning_content` |
| `utils/ai/chat/deepseek.ts` | 预设声明 `supportsThinking: true` |
| `utils/ai/thinking.ts` | **新增** 级别 → 线字段的唯一映射点，供对话与选区动作共用 |
| `utils/ai/polish.ts` | 单一「润色」重写为 6 动作表（润色/改写/续写/摘要/翻译/转待办），区分 `replace` / `card` 两类输出，`append` 标记续写 |
| `utils/ai/structured.ts` | **新增** JSON Output 摘要卡：`json_object` + 形状校验 + 空 content 时回退纯文本 |
| `utils/storage.ts` | `StoredAiPreferences.thinkingLevel` |
| `stores/aiStore.ts` | `thinkingLevel` 状态与持久化（默认 `low`）；**A5**：笔记目录移出 system prompt 到本轮 user 末尾；工具轮逐轮记录并回传 `reasoning_content` |
| `components/AI/AiSettingsPanel.tsx` | 思考强度三档分段控件 |
| `components/AI/AiPolishPanel.tsx` | 动作选择器；`card` 类动作渲染结果卡 + 复制，不再覆盖选区；续写按「原文 + 续写」合成后 diff |
| `utils/i18n.ts` | 中英各 19 条新文案；`aiPolishTitle/Entry` 改为「AI 选区动作」 |
| `docs/user-manual.md` | 同步手册（思考强度、选区动作、卡片不覆盖原文），保小青可答 |

验证：`npx tsc --noEmit` 无输出；`npm run build` 通过（8.53s，仅既有 chunk-size 警告）；
`node --experimental-strip-types scripts/smoke-manual-bm25.mts` 21/21。

### 顺带修掉的一个既有缺陷

`tools` 在场时 DeepSeek 要求**每一轮**都回传 `reasoning_content`，否则 400。原实现只解析不发送，
而思考模式默认开启 —— 即「完全开放」档 + 思考模式下，工具循环从第二轮起就可能 400。
本波在 `toWireMessage` 与工具轮里补齐了回传（无 `tools` 时官方会忽略该字段，故两种档位都发是安全的）。

---

## 附：本轮 grep 实测依据

`src/` 全量搜索，以下关键词零命中：`fim`、`completions.create`、`image_url`、`response_format`、
`json_object`、`reasoning_effort`、`tools/fetch`、`file_id`。
`thinking` 仅出现在注释与类型说明，请求体未发送该字段（`openaiCompat.ts` 只发
model / messages / stream / tools / temperature / max_tokens）。
