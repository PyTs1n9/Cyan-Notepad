# 决策记录：AI 侧栏重设计（2026-10-22）

## 背景

现有 AI 侧栏（`src/components/AI/AiSidebar.tsx` + `AiPolishPanel.tsx` + `AiSettingsPanel.tsx`）
布局"过于 AI 化"、组件 UI 不完善。目标：布局美化 + UI 美观 + 互动性。

## 结论

| 主题 | 决定 | 理由 |
| --- | --- | --- |
| 设计技能 | 使用 `ui-design-library`（Emil Kowalski 动效/打磨技能库） | 用户指定 |
| 视觉风格 | 现代聊天产品风 | 气泡对话感强、状态丰富，贴合聊天场景 |
| 互动性 | 微交互反馈 + 气泡悬浮操作 + 流式/进出场动画 | 用户多选 |
| 功能增补 | 复制 / 重新生成 / 双头像常显 / 悬浮时间戳 / 单条删除 / 清空加确认 | 用户多选；不做导出对话 |
| 头像 | 双头像常显：助手用 Sparkles/app 图标，用户用登录头像（未登录首字母） | 用户选择 |
| 时间戳 | 悬浮气泡时显示 | 保持界面干净 |
| 重新生成语义 | 追加新回复（旧回复保留可对比） | 用户选择 |
| 输入区 | 一体化胶囊：圆角容器内嵌自适应高度输入框（上限 5 行），发送/停止按钮内嵌右下 | 用户收敛 |
| 空状态 | 极简问候 | 用户选择 |
| 侧栏头部 | 模型名 + 连接状态点（绿=已配 key） | 用户选择 |
| 动画库 | 新增依赖 `motion`（官方新包名，`import from "motion/react"`） | 与 framer-motion 同版本同步发布，官方现行包名；tree-shaken 约 50KB，仅 AiSidebar 等 AI 组件按需引入 |

## 技术事实（已核实）

- `AiChatMessage` 无时间戳字段 → 需加 `createdAt: number`（消息仅存内存，无持久化迁移负担）。
- store 需新增：`deleteMessage(id)`（成对删除问+答）、`regenerate(assistantId)`（重发对应用户消息、追加新回复）、`clearChat` 前确认（UI 层）。
- `AiSettingsPanel` 挂载在 `SettingsModal` 内，美化需与模态框风格一致。
- 无动画库依赖（package.json 无 framer-motion/motion）。
- 动效规范遵循 ui-design-library：只动 transform/opacity、入场 ease-out、可打断、`prefers-reduced-motion` 降级。

## 暂未确定

- 无。

## 下一步

1. `npm install motion`
2. aiStore：`createdAt` 字段 + `deleteMessage` / `regenerate` actions
3. AiSidebar 全面重构（头部、消息列表、气泡、空状态、胶囊输入区）
4. AiPolishPanel / AiSettingsPanel 风格对齐
5. i18n 新增文案（复制、重生成、删除确认等）
6. PowerShell 下 `npm run build` 验证
