# 笔记磁贴窗口实现方案

## Context

用户需要快捷键 Ctrl+Shift+P 将当前笔记以独立置顶小窗口（磁贴）弹出，支持同时打开多个磁贴。磁贴无标题栏、始终置顶、可拖拽、只读展示笔记内容，并与主窗口主题同步。

## 技术决策

- **窗口创建**：前端 `WebviewWindow` API 动态创建，按需创建/销毁
- **内容传递**：URL 参数传 `noteId`，磁贴窗口自行读取文件 + 事件系统同步主题
- **前端渲染**：同一 `main.tsx` 入口，通过 URL 参数条件渲染 `TileView` 或 `App`
- **多磁贴**：动态 label `tile-{noteId}`，capability 用通配符 `tile-*`

## 数据流

```
Ctrl+Shift+P → [Rust] emit("pin-current-note")
  → [App.tsx] listen → 读取 activeNoteId → openTileWindow(noteId)
    → new WebviewWindow("tile-{noteId}", { url: "/?tile=1&noteId=xxx" })
      → [main.tsx] 检测 ?tile=1 → <TileView />
        → loadNoteContent(noteId) + loadSettings() → 渲染
```

## Task 1：修改 `src-tauri/src/lib.rs` — 注册快捷键

在 `with_shortcuts` 数组中添加 `"Ctrl+Shift+P"`，handler 中增加分支：emit `"pin-current-note"` 事件给前端。

## Task 2：修改 `src-tauri/capabilities/default.json` — 主窗口权限

追加权限：
- `"core:webview:allow-create-webview-window"`
- `"core:event:default"`
- `"core:event:allow-emit"`
- `"core:event:allow-listen"`

## Task 3：新建 `src-tauri/capabilities/tile.json` — 磁贴窗口权限

```json
{
  "identifier": "tile",
  "windows": ["tile-*"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
    "core:window:allow-hide",
    "fs:allow-read-text-file",
    "fs:scope (同主窗口)",
    "core:event:default",
    "core:event:allow-listen"
  ]
}
```

## Task 4：新建 `src/utils/tile.ts` — 磁贴管理工具

`openTileWindow(noteId)`:
1. 检查 `tile-{noteId}` 窗口是否已存在，存在则聚焦
2. 计算位置：主窗口右侧偏移
3. `new WebviewWindow('tile-{noteId}', { url: '/?tile=1&noteId={noteId}', width: 400, height: 500, decorations: false, alwaysOnTop: true, visible: true, resizable: true })`
4. 创建后 emit 主题同步事件

## Task 5：新建 `src/utils/theme.ts` — 提取共享主题逻辑

从 `App.tsx` 提取 `applyTheme(theme, customColors)` 函数，`App.tsx` 和 `TileView.tsx` 共用。

## Task 6：新建 `src/components/Tile/TileView.tsx` — 磁贴组件

UI 结构：
- 顶部拖拽栏（`data-tauri-drag-region`）+ 关闭按钮
- 笔记标题 + 时间/标签
- 内容区：HTML 直接渲染 / Markdown 用 `marked()` 转换
- 从 URL 获取 noteId，`loadNoteContent` + `loadSettings` 初始化
- 监听 `tile-theme-sync` 事件实时同步主题

## Task 7：修改 `src/main.tsx` — 条件渲染

解析 `URLSearchParams`，`tile=1` 时渲染 `<TileView />`，否则渲染 `<App />`。

## Task 8：修改 `src/App.tsx` — 注册事件监听

- `listen('pin-current-note')` → 读取 `activeNoteId` → `openTileWindow(noteId)`
- 主题变更时 `emit('tile-theme-sync', themeData)` 同步到所有磁贴

## Task 9：修改 `src/utils/i18n.ts` — 添加翻译键

| 键 | zh | en |
|----|----|----|
| `pinNote` | 置顶笔记 | Pin Note |
| `tileNoNote` | 没有选中的笔记 | No note selected |

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `src-tauri/src/lib.rs` | 修改 |
| `src-tauri/capabilities/default.json` | 修改 |
| `src-tauri/capabilities/tile.json` | 新建 |
| `src/main.tsx` | 修改 |
| `src/App.tsx` | 修改 |
| `src/utils/tile.ts` | 新建 |
| `src/utils/theme.ts` | 新建 |
| `src/components/Tile/TileView.tsx` | 新建 |
| `src/utils/i18n.ts` | 修改 |

## 验证方式

1. `npm run tauri dev` 启动应用
2. 打开一条笔记，按 Ctrl+Shift+P → 应弹出磁贴窗口
3. 验证磁贴：始终置顶、无标题栏、可拖拽、关闭按钮有效
4. 切换主窗口主题 → 磁贴主题应同步更新
5. 打开不同笔记的多个磁贴 → 应同时显示
6. 再次按同一笔记的 Ctrl+Shift+P → 应聚焦已有磁贴而非重复创建
