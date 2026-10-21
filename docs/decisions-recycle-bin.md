# 决策记录：笔记回收站（recycle bin）

日期：2026-10-22
状态：待确认后执行

## 背景

现状：删除笔记时 `Sidebar.confirmDeleteNote` → `noteStore.deleteNote(id)` +
`storage.deleteNoteFile(id)`，后者直接 `remove(data/notes/<id>.md)` 并调用
`cleanupUnusedImageAttachments()`。`.md` 一旦删除，`index.json` 里的元数据也随下一次
自动保存被覆盖，正文与元数据均不可恢复。

目标：删除改为「移入回收站」，可在「设置 / 基础 / 回收站保存时间」配置的期限内恢复。

## 结论

### 1. 入口位置

结论：侧边栏底部加「回收站」图标，点击打开弹窗（列表 + 恢复 + 彻底删除）。
理由：改动面最小，不新增 `ViewType`，避免与 `todo / canvas / workspace` 的布局分支、
主题同步和侧边栏折叠逻辑纠缠；回收站是低频操作，不值得占用一个主视图。

### 2. 保留期档位

结论：「关闭 / 7 天 / 30 天 / 90 天 / 永久」，默认 30 天。
理由：默认值与现有 `img-trash` 的 30 天一致，用户心智统一；「永久」作为显式选项
（需提示会持续占用磁盘）。

### 3. 「关闭」的语义

结论：关闭 = 删除即物理删除，不进回收站。
理由：显式关闭等同于用户自愿放弃撤销能力，与传统系统回收站语义一致；避免
「进了回收站但下次清理就没了」的模糊状态。

### 4. 恢复位置

结论：恢复到原分类 + 原排序位置；原分类已被删除时落到「未分类」末尾。
理由：回收时快照 `categoryId` 与 `order`，恢复即还原现场，用户不需要二次整理。

### 5. 图片附件

结论：删除笔记时，把它引用的附件从 `data/img/` 移入回收站目录一并保管，恢复时一并还原。
理由：现有 `img-trash` 清理期硬编码 30 天，若保留期设为 90 天或永久，笔记恢复后会出现
缺图。附件跟随笔记走，语义最清晰。

### 6. 保留期同时接管 img-trash

结论：把 `IMAGE_TRASH_RETENTION_MS` 的硬编码 30 天改为读取同一设置项。
理由：设置页只暴露一项「回收站保存时间」，避免两个来源不同的保留期相互矛盾
（否则需要文案额外解释「图片仍 30 天」）。

### 7. 过期清理时机

结论：应用启动时 + 每次打开回收站面板时做惰性清理，不加后台定时器。
理由：过期条目最晚在下一次打开面板时消失，成本最低，也不需要随设置变化重建 `setInterval`。
保留期改动后（如由永久改 7 天），按 `deletedAt` 判断是否过期。

### 8. 删除确认交互

结论：保留现有确认弹窗，文案改为「移入回收站」，并在弹窗内显示保留天数。
理由：删除从不可逆变为可逆，心理负担降低，但保留一次确认可避免置顶笔记等边界上的误操作；
置顶笔记仍不可删除（沿用 `noteStore.deleteNote` 的现有约束）。

### 9. 列表信息量

结论：列表只显示标题、原分类、删除时间、剩余天数；不加载正文摘要。
理由：按标题即可定位；避免扫描时读取每个 `.md` 的开头，也让弹窗保持轻量。

### 10. 批量操作

结论：提供单条「彻底删除」与「清空回收站」，均需二次确认。
理由：用户需要立即释放空间的出口；自动过期作为兜底。

### 11. 覆盖范围

结论：本版仅覆盖笔记（`.md` + 元数据）。画布、待办、分类删除维持现状。
理由：需求明确指向笔记本内的文本；画布与分类的删除链路各自独立，扩大会让改动面翻倍。

## 实现约定（技术默认值，无需另行确认）

- 目录：`data/trash/notes/<id>.md`、`data/trash/notes/img/<filename>`、
  `data/trash/notes/index.json`（清单：`id / title / tags / categoryId / categoryName /
  pinned / order / createdAt / updatedAt / deletedAt / attachments[]`）。
- 清单是元数据的唯一来源，不从文件 mtime 推断删除时间。
- 设置项字段：`trashRetentionDays: number`，`0` = 关闭，`-1` = 永久，其余为天数。
- 恢复 = 写回 `.md` + 移回附件 + 重新插入 `noteStore`（`loadNotes` 之后由自动保存重建索引）。
- 回收站目录不在 `notes/` 下，`recoverNoteListFromFiles` 不会把回收站文件误当作有效笔记。

## 待定问题

无。若实现中发现 `cleanupUnusedImageAttachments` 与附件搬迁存在竞态，再单独记录。

## 实现记录（2026-10-22）

- `src/utils/storage.ts`：新增 `moveNoteToTrash` / `listTrashNotes` / `restoreTrashNote` /
  `purgeTrashNote` / `emptyNoteTrash` / `purgeExpiredNoteTrash` / `isTrashEntryExpired`；
  `cleanupUnusedImageAttachments` 的过期清理改为读 `trashRetentionDays`（永久则跳过）。
- `src/stores/settingsStore.ts`：新增 `trashRetentionDays`（默认 30）、`normalizeTrashRetentionDays`。
- `src/stores/noteStore.ts`：新增 `restoreNote`，恢复原分类与原顺序，分类已删则落未分类。
- `src/components/Trash/TrashModal.tsx`：列表、恢复、彻底删除、清空、关闭态引导。
- `src/components/Layout/Sidebar.tsx`：底部入口（展开/折叠两种形态），删除确认改为「移入回收站」。
- `src/utils/noteFlush.ts` + `NoteEditor`：删除前先落盘编辑中的内容，并在切换笔记时跳过
  已删除笔记，避免回收站后又被编辑器写回一个孤立 `.md`。
- `App.tsx`：启动时与保留期变更后调用 `purgeExpiredNoteTrash()`。
- 附带问题：`cleanupUnusedImageAttachments` 与附件搬迁的先后顺序已按「先写回收站副本、
  再移附件、最后删源文件」处理，未发现竞态。
