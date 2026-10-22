# 决策记录：AI 侧栏多会话（2026-10-22）

## 背景

AI 侧栏目前只有单一会话（内存 messages 数组）。用户要求：新建会话、切换会话、查看历史会话。

## 结论

| 主题 | 决定 | 理由 |
| --- | --- | --- |
| 存储 | 持久化到 `data/ai-chats.json`（经 storage.ts） | 重启后历史仍在；与应用"数据存 data/ 目录"原则一致 |
| 标题 | 首条提问自动命名，可手动改名 | 零操作成本 + 可控 |
| 切换 | 切走自动保存当前会话，切回完整恢复 | 无打断 |
| 列表 UI | 头部"历史会话"图标 → 下拉面板（新建 + 列表 + 当前高亮） | 不占侧栏空间 |
| 新建入口 | 头部独立"新建会话"图标按钮 | 一键直达 |
| 会话操作 | 重命名、删除（二次确认）、按最后活跃排序 | 用户多选 |
| 空会话 | 无消息时切走即丢弃，不入列表 | 避免空会话堆积 |

## 设计要点

- 数据结构：`{ id, title, createdAt, updatedAt, messages: AiChatMessage[] }[]`，单文件 `data/ai-chats.json`。
- store 状态：`conversations: AiConversation[]`、`activeConversationId: string | null`、`messages` 保持为当前会话的内存视图。
- 写路径：sendMessage/deleteMessage/regenerate/clearChat 等 mutation 后同步落盘当前会话（debounce 或直接 await，消息量小直接写）。
- 流式中途切会话：abort 当前生成（复用 stopGenerating），目标会话恢复。
- i18n 新增：aiNewChat、aiHistory、aiRename、aiDeleteConversation、aiDeleteConversationConfirm、aiUntitled（兜底标题）等。
- 无新增依赖，无技术栈选择 → architect 不适用。

## 暂未确定

- 会话数量上限（用户未选 50 上限 → 暂不限制）。

## 下一步

1. storage.ts：`loadAiConversations` / `saveAiConversations`
2. aiStore：会话状态 + actions（newConversation、switchConversation、renameConversation、deleteConversation），messages 操作联动持久化
3. AiSidebar 头部：新建按钮 + 历史下拉面板（重命名内联/删除确认）
4. i18n 文案；PowerShell 构建验证
