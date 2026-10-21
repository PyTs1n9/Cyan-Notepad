# 决策记录：AI 接入与本地知识库

日期：2026-10-22
状态：待确认后执行
强度：拷打（4 轮问答 + 2 轮概念澄清）

## 背景

需求起点：「给笔记本接入 API AI 的调用，或者是本地的知识库」，并希望向使用者收取一定费用。

排查到的现状：

- 技术栈固定 Tauri v2 + React 19 + TypeScript，数据全部落在本地 `data/`（Markdown + JSON）。
- 已有 Supabase（认证 / 工作台 / 云文档 / RPC）与 `collab-server`（Hocuspocus + Yjs 实时协作，部署在 Render，持有 service_role key）。
- `docs/online-workspace.md` 已确立安全边界：EXE 只含公开信息，secret 仅存在于服务端。
- `data/notes/` 当前仅 4 篇笔记，11MB 中主要是图片附件。
- `src-tauri/src/credentials.rs` 已有 Windows DPAPI 封装（`CryptProtectData` / `CryptUnprotectData`）与两个 Tauri 命令，可直接复用。
- `src/components/Editor/NoteEditor.tsx` 的所有编辑最终汇聚为单一字符串 `content`，经 `saveNoteContent(noteId, content)` 落盘；Yjs 绑定在 `MarkdownSourceEditor` 的 CodeMirror 上。

本轮明确了三件事：不内置生成模型、只接入 DeepSeek、收费按「软件功能费」而非「token 差价」。

## 结论

### 1. 商业模式：模式 1（软件功能费 + 用户自带 Key）

结论：不代收模型费用，不转售 token。用户自行到 DeepSeek 开通 API 并填入本机，应用只按软件能力收费。

理由：国内代收 token 费用属于经营性互联网信息服务，需 ICP 许可证（要求中国大陆公司、注册资本 ≥100 万、3 名员工社保，审批 40–60 工作日）、算法备案（2–3 个月）与大模型登记；《生成式人工智能服务管理暂行办法》第二十二条明确把「通过可编程接口提供服务」纳入服务提供者范围，「只是转发管道」不构成免责。模式 1 下笔记直接经用户设备发往 DeepSeek，不经过本项目服务器，合规义务与工程复杂度同时降到最低。

### 2. 模型接入范围：仅 DeepSeek，按 OpenAI 兼容协议实现

结论：只做 DeepSeek 一家的适配，但请求层按 OpenAI 兼容格式编写（`baseURL` + `apiKey` + `/chat/completions`）。

理由：DeepSeek 官方同时提供 OpenAI 与 Anthropic 两种 base URL，按兼容协议实现即可；后续要接 Kimi / Qwen / GLM / 硅基流动时，只需在设置里增加预设项，不改调用层。

### 3. 生成模型：不内置，只接云端

结论：不在安装包内放置任何对话生成模型（不集成 Qwen 小模型、不依赖 Ollama）。

理由：1.5B–3B 量级的本地模型在无独显机器上体验不可接受，安装包增重 1–2GB，且效果远逊于云端；用户已确认「只自带检索」。

### 4. 检索模型：`bge-small-zh-v1.5` int8，随安装包分发

结论：使用 int8 量化版（24MB）作为 Tauri resource 打进安装包，运行在 Web Worker 内的 transformers.js 上。

理由：int8 把权重从约 91MB 压到 24MB，与原版余弦相似度 0.9856，检索任务无感；24MB 对 NSIS 安装包可忽略，因此不需要下载器（省掉断点续传、校验、镜像、失败重试整套逻辑）。GitHub Release 支持单文件 <2GiB 且带宽免费，但为 24MB 引入网络依赖不划算。

### 5. 能力边界：检索模型只负责「找」

结论：该模型仅输出 512 维向量，用于语义检索、相似笔记与去重；不承担任何生成任务。

理由：它是编码器，没有语言生成能力。生成必须由 DeepSeek 完成。这一点决定了「自带 RAG 知识库」不能替代模型接入，两条链路必须同时存在。

### 6. 检索层：抽象 `retrieve()`，默认走向量检索

结论：统一出口 `retrieve(query, opts) => RetrievedChunk[]`，提供两种实现——`vector`（默认，RAG）与 `full-context`（降级）。

理由：默认按用户要求做 RAG；保留全文注入实现，用于索引未建好、检索结果为空或相似度低于阈值时的回退，避免「检索没命中就答不知道」。两者共用同一接口，上层调用代码不感知差异。

### 7. 向量存储：二进制文件 + 暴力余弦，不引入向量库

结论：索引存 `data/ai/index.bin`（`Float32Array` 拼接）+ `data/ai/index.json`（块元数据）。

理由：1 万条 512 维向量的全量余弦计算在 JS 中约几十毫秒，`sqlite-vec` / LanceDB 带来的依赖、迁移与打包成本在语料只有 4 篇的现状下没有对应收益。语料增长到十万级时再评估换库，届时只需替换 `indexStore`。

### 8. AI 写入授权：先出建议 → diff 预览 → 用户确认 → 可撤销

结论：AI 不直接改文件。生成结果先进 diff 预览，用户确认后才写入编辑器内容。写入前自动保存原文快照。

理由：`content` 是整串替换，误写会覆盖正文。快照存 `data/ai/snapshots/<noteId>/<timestamp>.md`，撤销即回写快照；不依赖回收站（回收站是笔记级删除，粒度不匹配）。

### 9. 协作冲突：不处理 CRDT 合并，但协作会话期间禁用 AI 写入

结论：检测到活跃协作会话时，AI 的「应用」按钮禁用并提示原因；只读问答不受影响。

理由：整串替换对 Yjs 是一次巨型删除+插入，会破坏他人正在编辑的文档状态。正确做法（把改动拆成 CRDT 事务）成本远高于当前收益，而「协作时禁用写入」用一行判断就能消除风险。

### 10. UI 入口：右侧 AI 侧栏

结论：侧栏是唯一主入口，承载对话、引用来源展示、diff 预览与设置入口。

理由：写作辅助、全文问答、通用聊天三类需求的交互都是「多轮 + 需要看到引用」，浮动菜单装不下引用与对话历史。

### 11. 隐私边界：明确降级，并主动告知

结论：`数据不出本机` 只对检索成立——embedding 在本地计算，笔记原文不落任何第三方；但检索出的片段与选中段落会发往 DeepSeek。首次启用云端模型时弹窗告知具体内容与接收方。

理由：用户已选择接受云端生成；若不主动告知，「本地知识库」的说法会让人误以为数据完全不出机，信任成本更高。告知内容需写清「哪些内容、发给谁、可否撤回」。

### 12. Key 存储：复用现有 DPAPI 通道

结论：API Key 经 Windows DPAPI 加密后存 `data/ai/credentials.bin`，不写 `settings.json`、不进 localStorage。

理由：`src-tauri/src/credentials.rs` 已有 `CryptProtectData` / `CryptUnprotectData` 封装，扩展一对通用 `encrypt_secret` / `decrypt_secret` 命令即可；`settings.json` 会随数据目录被用户备份或分享，明文 Key 不应出现在那里。

### 13. 上下文与成本：按 1M 窗口规划，不做人为截断

结论：DeepSeek V4 系列上下文为 1M token，笔记内容作为稳定前缀可获得缓存命中价格；prompt 组装按实际需要取材，不设固定截断阈值。

理由：官方定价页（2026-08-17 起峰谷计价，工作日 9:00–12:00、14:00–18:00 为高峰）显示缓存命中输入为 0.3 元/百万 token（高峰），未命中 9 元/百万；笔记作为不变前缀命中率高，4 篇笔记的单次问答成本在分级钱。参考：<https://api-docs.deepseek.com/quick_start/pricing>

## 实现约定（技术默认值，无需另行确认）

- 新增目录 `src/utils/ai/`：`provider.ts`（DeepSeek 适配 + 错误归一）、`chunking.ts`（切块）、`embedding.ts`（Worker 入口）、`indexStore.ts`（索引读写）、`retrieval.ts`（`retrieve` 双实现）、`snapshot.ts`（快照与撤销）、`diff.ts`（行级 diff）。
- 切块策略：按 Markdown 标题层级切分，单块上限 512 字，相邻块重叠 64 字；元数据记 `noteId` / `heading` / `charRange`。
- 索引失效：`notes/index.json` 或笔记文件的修改时间变化时，仅重算该笔记的块，标记为脏并在空闲时刷新。
- embedding 全部在 Web Worker 中执行，主线程只接收 `Float32Array`，避免建索引期间 UI 卡死。
- `src/stores/aiStore.ts`：侧栏开关、模型配置、会话列表、索引状态；持久化到 `data/ai/settings.json`（不含 Key）。
- 组件：`src/components/AI/AiSidebar.tsx`、`AiDiffPreview.tsx`、`AiSettingsPanel.tsx`、`AiPrivacyNotice.tsx`。
- `src-tauri/src/lib.rs` 注册 `encrypt_secret` / `decrypt_secret` 命令，复用 `credentials.rs` 的 DPAPI 调用。
- `src-tauri/tauri.conf.json` 的 `bundle` 增加 `resources`，把模型文件目录映射进安装包；`src/utils/ai/embedding.ts` 通过 `resolveResource` 定位。
- 依赖新增仅 `@huggingface/transformers`（transformers.js v4）一项；模型文件不入 Git，随构建产物打包。
- AI 写入路径：生成新 `content` → diff 预览 → 确认后写入 `NoteEditor` 的 content 状态 → 交由既有 autosave 落盘，**不直接调用 `saveNoteContent`**，避免绕过编辑器状态造成不一致。
- i18n 新增词条：`aiAssistant`、`aiSettings`、`aiApiKey`、`aiPrivacyNotice`、`aiPrivacyNoticeBody`、`aiApplyChange`、`aiRevertChange`、`aiIndexing`、`aiIndexReady`、`aiDisableWriteInCollab`、`aiNoKey`。

## 待定问题

1. 授权校验方式。三选一：(a) Ed25519 离线签名授权码，客户端内置公钥验签，零服务器、离线可用；(b) 复用 Supabase 账号，查 `entitlements` 表，可吊销但需联网；(c) 不做校验，靠自愿付费。推荐 (a)。
2. 收款渠道。个人身份可选爱发电 / 面包多（有抽成）、虎皮椒 / Payjs 等聚合支付（约 1%–1.5%）；微信支付商户号需营业执照。费率与可用性以各平台当前页面为准。
3. 定价形式：一次性买断、年度订阅，还是按大版本收费。
4. 是否增加「仅本地模式」开关（开启后禁用一切云端调用，AI 侧栏只保留检索与相似笔记）。此开关与结论 11 的告知文案互相依赖。
5. 低配机器（4GB 内存）占比。若占比较高，首次建索引需改为后台分批进行，并在侧栏显示进度，工作量约增加 2–3 天。

## 工作量估算

| 模块 | 估时 |
| --- | --- |
| AI 基础层（provider、Key 存储、设置页） | 2–3 天 |
| 检索层（切块、Worker、索引、`retrieve` 双实现） | 3–5 天 |
| UI（侧栏、diff 预览、快照撤销、隐私弹窗） | 4–6 天 |
| 授权校验 | 1–2 天 |
| 合计 | 10–16 天 |

## 下一步

待定问题 1–3 确认后开工，实施顺序为：AI 基础层 → 侧栏与对话 → 检索层 → 写入与撤销 → 授权校验。每段完成后跑 `npx tsc --noEmit` 与 `npm run build`。
