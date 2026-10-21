# 决策记录：AI 助手与笔记润色

日期：2026-10-22
状态：待确认后执行

## 需求

两条，互不依赖：

1. **右侧栏增加 AI 助手**：检索内置知识库，回答「这个软件怎么用」这一类问题。
2. **用户可配置自己的 DeepSeek API Key**：用于润色、修改本地笔记的选中内容。

## 排查到的现状

- 技术栈固定 Tauri v2 + React 19 + TypeScript，数据全部落在本地 `data/`（Markdown + JSON）。
- `src-tauri/src/credentials.rs` 已有 Windows DPAPI 封装（`CryptProtectData` / `CryptUnprotectData`）与两个命令，可直接复用。
- `src/components/Editor/NoteEditor.tsx` 的所有编辑最终汇聚为单一字符串 `content`，经 `saveNoteContent(noteId, content)` 落盘；Yjs 绑定在 `MarkdownSourceEditor` 的 CodeMirror 上。
- 项目已有 Supabase 与 `collab-server`（Hocuspocus + Yjs 协作），安全边界为「EXE 只含公开信息，secret 仅存在于服务端」。

## 结论

### 1. 两个功能彼此独立，不共享检索

结论：AI 助手只检索「功能手册」；笔记润色不检索任何东西，直接用选中段落与当前笔记作上下文。

理由：助手回答的是产品问题，笔记内容是噪音；润色只需要改写眼前这段文字，检索只会引入无关材料。拆开之后，笔记侧完全不需要 embedding 与索引，工作量大幅下降。

### 2. 知识库内容：手写功能手册

结论：新建 `docs/user-manual.md` 作为唯一语料来源，面向使用者撰写。

理由：现有 `AGENTS.md` 是开发者视角（MSVC 环境、构建命令），对用户是噪音；README 偏项目介绍，缺操作步骤。手册需覆盖：界面分区、笔记/待办/画布/便签各功能的操作路径、快捷键、导入导出、数据目录位置、常见问题。

### 3. 检索实现：本地 embedding + 暴力余弦

结论：`bge-small-zh-v1.5` int8（24MB）打进安装包，在 Web Worker 里用 transformers.js 运行；索引存 `manual-index.bin` + `manual-index.json`；检索时全量算余弦取 top-5。

理由：24MB 对 NSIS 安装包可忽略，无需下载器；手册只有几十页、几百个切块，暴力检索在毫秒级，不需要向量库。索引在**构建期**生成，随包分发，运行时只读。

### 4. 无 Key 时的降级

结论：未配置 Key 时助手仍可用，但只做「检索 + 片段展示」；配置 Key 后才生成自然语言回答。

理由：手册内容的答案本就是确定的，直接给原文片段带位置，比让模型复述更准，也让用户在不产生任何费用的前提下获得价值。

### 5. 生成模型：只接 DeepSeek，云端调用

结论：只接 `deepseek-flash`，按 OpenAI 兼容协议实现（`https://api.deepseek.com` + `/chat/completions`）。

理由：按官方文档，`deepseek-v4-pro` 已退役（2026-09-14 起请求全部路由至 V4.1 Flash），当前仅 `deepseek-flash` 一个有效模型，因此**本期不做模型选择器**，设置页只显示模型名。请求层按兼容协议写，将来接第二家只加预设项。

### 6. Key 存储：复用现有 DPAPI

结论：API Key 经 Windows DPAPI 加密后存 `data/ai/credentials.bin`。

理由：`credentials.rs` 已有加解密封装，扩一对通用命令即可。不写 `settings.json`（会随数据目录被备份或分享），不进 localStorage。

### 7. 润色：预览后应用，可撤销

结论：AI 生成的改写结果先进 diff 预览，用户点「应用」才写入；写入前自动保存原文快照，可一键撤回。

理由：`NoteEditor` 的内容最终是整串 `content`，误写会覆盖正文。快照存 `data/ai/snapshots/<noteId>/<timestamp>.md`。

### 8. 写入路径：经编辑器状态，不直写文件

结论：应用改动时更新 `NoteEditor` 的 content 状态，由既有 autosave 落盘；**不直接调用 `saveNoteContent`**。

理由：绕过编辑器状态会导致界面与磁盘不一致；走同一路径还能让 Yjs 协作绑定自然跟随。

### 9. 协作会话期间禁用润色

结论：检测到活跃协作会话时「应用」按钮禁用并说明原因；助手问答不受影响。

理由：整串替换对 Yjs 是一次巨型删除+插入，会破坏他人正在编辑的文档。

### 10. 收费：模式 1（软件功能费），不代收 token

结论：不做 API 中转，不代收模型费用；用户自己的 Key 直连 DeepSeek。

理由：国内代收 token 费用属经营性互联网信息服务，需 ICP 许可证（中国大陆公司、注册资本 ≥100 万、3 名员工社保）、算法备案与大模型登记；模式 1 下笔记内容不经过本项目服务器，合规与工程成本都最低。

### 11. 隐私告知

结论：首次配置 Key 时弹窗说明：选中的笔记内容与助手提问会发送至 DeepSeek；本地检索不联网。

理由：避免用户误以为「本地知识库」等于「完全不出本机」。

## 相比前几轮砍掉的内容

以下曾出现在讨论中，因与最终需求无关而移除：

- 笔记向量索引、双库合并检索、相似笔记推荐 —— 助手不查笔记，没有索引对象
- 自动摘要、标签建议、拆待办 —— 需求未提及
- 检索层的全文注入实现 —— 只用手册索引一种检索
- 模型选择器 —— 只有一个可用模型
- 外部知识库平台（Dify 等）—— 手册只有几十页，本地索引零成本且可离线；将来手册膨胀到 200 页以上再评估
- 内置本地生成模型 —— 内存与质量代价都不划算，帮助类问题用检索片段即可

## 实现约定

- 新增 `src/utils/ai/`：`provider.ts`（DeepSeek 适配）、`chunking.ts`、`embedding.ts`（Worker 入口）、`manualIndex.ts`（索引读写与检索）、`snapshot.ts`、`diff.ts`。
- 切块：按 Markdown 标题切分，单块上限 512 字，相邻重叠 64 字；元数据记 `heading` / `charRange`。
- 构建期脚本 `scripts/build-manual-index.mjs`：读 `docs/user-manual.md` → 生成向量 → 输出 `manual-index.bin/json`；在 `npm run build` 前置执行。
- `src-tauri/tauri.conf.json` 的 `bundle.resources` 增加模型目录与 `manual-index.*`；前端通过 `resolveResource` 定位。
- 依赖新增仅 `@huggingface/transformers`（transformers.js v4）。
- 组件：`src/components/AI/AiSidebar.tsx`、`AiDiffPreview.tsx`、`AiSettingsPanel.tsx`、`AiPrivacyNotice.tsx`。
- `src/stores/aiStore.ts`：侧栏开关、是否有 Key、会话、索引状态。
- 润色的 prompt 约束：只返回改写后的段落纯文本，不带解释、不加引号、保持 Markdown 行内格式不变。
- `src-tauri/src/lib.rs` 注册 `encrypt_secret` / `decrypt_secret`。
- i18n 新增：`aiAssistant`、`aiSettings`、`aiApiKey`、`aiPrivacyNotice`、`aiPrivacyNoticeBody`、`aiApplyChange`、`aiRevertChange`、`aiSearchOnlyHint`、`aiNoKey`、`aiDisableWriteInCollab`。

## 待定问题

1. 授权校验方式：(a) Ed25519 离线签名码（推荐，零服务器）；(b) 复用 Supabase 账号查授权表；(c) 不做校验。
2. 收款渠道：爱发电 / 面包多、虎皮椒 / Payjs 等聚合支付、或微信支付商户号（需营业执照）。费率以各平台当前页面为准。
3. 定价形式：一次性买断、年度订阅，或按大版本收费。
4. 《功能手册》的维护归属：发布检查清单里加一条，或在 CI 里比对 UI 词条与手册覆盖度。

## 工作量估算

| 模块 | 估时 |
| --- | --- |
| 《功能手册》撰写 + 构建期索引脚本 | 2–3 天 |
| embedding Worker + 检索 + 侧栏对话（含无 Key 降级） | 2–3 天 |
| Key 配置、DPAPI 命令、隐私弹窗 | 1 天 |
| 润色（选区、diff 预览、应用、快照撤销） | 3–4 天 |
| 授权校验 | 1–2 天 |
| 合计 | 9–13 天 |

## 下一步

实施顺序：Key 配置与 provider → 手册与索引 → 侧栏对话 → 润色与撤销 → 授权校验。每段完成后跑 `npx tsc --noEmit` 与 `npm run build`。
