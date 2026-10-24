# 决策记录：AI API 接口设置（用户自配置接口）

日期：2026-10-23　强度：深挖（grill 四轮）　状态：已实现

## 需求

设置页里「API 接口」要能做到应用级软件的形态：

1. 用户自己填接口地址（baseUrl）与 API Key，配什么就用什么；
2. 设置里点「搜索模型」，连上后列出该服务实际的模型列表；
3. 列表里勾选允许使用的模型；
4. 聊天栏的模型下拉自动只显示被勾选的那些。

**前提变更**：撤回 `decisions-ai-integration.md` #11「不做用户自定义 endpoint UI」；并进一步删除内置 DeepSeek 预设——AI 侧不再内置任何厂商，全部由用户配置。

## 已定结论

1. **多接口并存，聊天栏合并列表**。每条接口 = 名称 + baseUrl + Key + 模型子集；聊天栏下拉合并所有接口里被勾选的模型，每行下方标注接口名。
   理由：与主流应用一致；单一「当前接口」做不到同时用云端 + 本地 Ollama。
2. **删除内置预设**。`chat/deepseek.ts` 已删除，注册表改为从持久化配置派生。
   理由：用户明确要求「现在 AI 设置变成全部都是用户自己去配置的接口」。
3. **模型来源 = `GET {baseUrl}/models`，勾选即启用**。新发现的模型**默认不勾选**。
   理由：勾选是「允许使用」的唯一表达；默认全选会让聊天栏被几十个模型淹没。
4. **思考能力无法从接口识别**。OpenAI 兼容的 `/models` 只返回 `id/object/created/owned_by`，没有能力字段；因此采用「模型名启发式 + 用户可改」：设置里每个模型行有一个「思考」标记，聊天栏 hover 展开的三档强度只对标记过的模型出现。
   理由：少数网关有扩展字段（OpenRouter `supported_parameters`、Ollama `/api/show` capabilities）但不通用；猜错只多一次点击。
5. **工具调用不进接口配置**。写笔记权限只由 `noteWriteMode`（仅助手 / 完全开放）决定，接口层假设都支持 `tools`。
   理由：用户明确「写笔记属于权限层、管理层」；两层闸门会让「开了完全开放为什么还是不能改」变成排查题。
6. ~~**联网搜索按 host 门控**~~ **（同日作废：整个联网搜索功能已删除**，见文末「后续变更」）。
7. **HTTP 白名单放开**。`capabilities/default.json` 的 http scope 从 `https://api.deepseek.com/*` 改为任意 http/https 主机（含显式端口）。
   理由：地址是运行时输入的，构建期无法枚举。注意 URLPattern 里端口是独立分量，`http://**` 匹配不到 `http://localhost:11434`，四种写法都要写。
8. **旧 Key 自动迁移**。首次启动若 `endpoints.json` 为空而 `credentials.bin` 存在，就生成一条名为 DeepSeek、地址为官方的接口并把旧 Key 挂上去，种子模型为旧常量 `deepseek-flash`。旧文件保留不删。
   理由：升级后聊天不能直接哑掉；保留旧 blob 让降级不丢数据。
9. **每个接口独立密钥**。`data/ai/endpoint-keys.json` = endpointId → DPAPI 密文；一个密钥解不开只损失那一条接口。
10. **不做代理设置**。baseUrl 可填自建网关/中转地址。
11. **设置页形态 = 卡内列表 + 行内展开**：行上是名称/地址/Key 状态/模型计数，展开后是名称、Base URL、Key、模型搜索与勾选、删除。
12. **ModelPicker 仍是模型选择器**，不承担接口管理，只保留一个「管理接口与模型」跳转。

## 实现约定

- provider 注册表是**运行时状态**：`chat/index.ts#syncChatProviders(endpoints)`，由 `aiStore` 在 hydrate 与每次配置变更后调用。`getChatProvider(id)` 的 id 现在是**接口 id**。
- 选择值统一为 `"<endpointId>::<modelId>"`（`chat/endpoints.ts` 的 `makeSelection`/`parseSelection`），`"local"` 仍是小青。`chatModel` / `polishModel` 持久化格式随之改变；旧的裸 provider id（`"deepseek"`）在 `normalizeChatModel` 里被重映射到该接口的第一个启用模型。
- `ModelTarget.thinking` **可以不出现**：不支持思考的模型一个思考字段都不发。`disabled` 与「不支持」必须可区分——后者什么都不写才是对的。
- `openaiCompat` 不再判断 `supportsThinking`，只发 `resolveTarget` 决定的内容；能力判断上移到「模型」这一级（`ProviderModel.supportsThinking`）。
- 接口无启用模型时仍注册（设置页要它），但 `listChatProviders()` 过滤掉，聊天栏不会出现空接口。
- 首次保存自定义地址**不再弹风险确认**：隐私说明改成「发给你配置的那个服务」，同屏可见；每次新增接口都弹会变噪音。

## 后续变更（2026-10-23，同日）

**联网搜索整体移除**：设置页的搜索卡片、`utils/ai/search/`、`AiChatMessage.sources/searchError`、
「正在联网搜索…」阶段、来源卡片与失败提示、`preferences.searchEnabled` 全部删除；提示词里
「若提供了【网页】搜索结果…」的段落一并去掉。理由：功能下线，留下运行时死代码比删更难维护。
FAQ 的 Q20 与手册的两条联网说明同步删除，冒烟脚本对应 4 条用例移除（17/17 通过）。

## 待定 / 已知限制

1. 接口数量上限（当前不限制，超过 10 条设置页会偏长）。
2. `/models` 不实现的服务（部分自建网关）目前无法添加模型——需要「手填模型名」兜底，尚未做。
3. 非兼容协议（Claude / Gemini 原生）仍不做。
4. 模型名启发式只覆盖常见推理命名，冷门模型需手动点亮「思考」。
5. 无 GUI 手测：真实 Key 下的「搜索模型 → 勾选 → 聊天栏出现 → 发一轮对话」链路待人工验证。

## 下一步

1. 人工验证上面第 5 条链路（含本机 Ollama 与一个云端接口）。
2. `npm run tauri build` 验证放开 http scope 后 NSIS 包的网络请求正常。
3. 视需要补「手填模型名」。
