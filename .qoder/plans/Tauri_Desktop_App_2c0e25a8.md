# Tauri + React 桌面工具应用

## 技术栈确认

| 层面 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri v2 | Rust 后端，体积小(~5MB)，性能好 |
| 前端框架 | React 18 + TypeScript | 组件化开发 |
| 构建工具 | Vite | 极速热更新 |
| 富文本编辑器 | TipTap (ProseMirror) | 支持颜色/字号/粗细/自定义字体/插图/标签 |
| 状态管理 | Zustand | 轻量简洁 |
| 本地存储 | Markdown 文件 + JSON 元数据 | 通过 Tauri fs 插件读写 |
| 样式 | Tailwind CSS v4 | 快速构建现代 UI |
| 路由 | React Router v6 | 页面导航 |
| 图标 | Lucide React | 现代简洁图标库 |

## 项目结构

```
Todolist-vibe/
  src/
    components/
      Layout/           -- 侧边栏 + 主内容区布局
      Todo/             -- 待办事项组件
      Editor/           -- TipTap 富文本编辑器
      NoteList/         -- 笔记列表侧边栏
      TagManager/       -- 标签管理
    stores/             -- Zustand 状态管理
    hooks/              -- 自定义 hooks
    utils/              -- 工具函数 (文件读写、Markdown 解析)
    types/              -- TypeScript 类型定义
    App.tsx
    main.tsx
  src-tauri/
    src/
      main.rs           -- Tauri 入口
      commands/         -- Rust 命令 (文件操作)
    Cargo.toml
  data/                 -- 用户数据目录 (运行时)
    todos.json          -- 待办数据
    notes/              -- Markdown 笔记文件
    fonts/              -- 用户导入的字体文件
```

## 任务规划

### Task 1: 环境准备与项目初始化
- 安装 Rust、Node.js 依赖检查
- 使用 `npm create tauri-app@latest` 初始化 Tauri v2 + React + TS 项目
- 安装核心依赖: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-image`, `@tiptap/extension-underline`, `tailwindcss`, `zustand`, `react-router-dom`, `lucide-react`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`
- 配置 Tailwind CSS 和 TypeScript 路径别名

### Task 2: Tauri 后端配置
- 配置 `tauri.conf.json`: 窗口标题/大小/装饰、文件系统权限
- 添加 Tauri 插件: fs (文件读写)、dialog (文件选择对话框)
- 编写 Rust commands: 读写 Markdown 文件、管理 JSON 数据、导入字体文件

### Task 3: 整体布局与路由
- 实现 Notion 风格侧边栏布局 (左侧导航 + 右侧内容区)
- 侧边栏包含: Todo 入口、笔记列表、新建笔记按钮
- 配置 React Router: `/` (Todo 页)、`/note/:id` (笔记编辑页)
- 全局配色方案: 浅色/深色主题基础变量

### Task 4: Todo 待办模块
- Zustand store: 待办列表状态 (增删改查、完成状态、优先级)
- 数据持久化: 读写 `data/todos.json`
- UI 组件: 待办列表、添加表单、完成/删除操作、分类筛选
- 支持拖拽排序

### Task 5: TipTap 富文本编辑器
- 基础编辑功能: 标题、段落、列表、引用
- 文字调节: 颜色选择器、字号调节、粗细切换、下划线
- 图片插入: 本地图片选择并嵌入 (base64 或文件路径)
- 自定义字体: 导入 .ttf/.otf 字体文件，在编辑器中应用
- 标签系统: 在笔记中插入标签标记，支持按标签筛选

### Task 6: 笔记管理模块
- Zustand store: 笔记列表状态
- 笔记以 Markdown 格式存储在 `data/notes/` 目录
- 笔记元数据 (标题、标签、创建时间) 存储为 JSON frontmatter
- 侧边栏笔记列表: 搜索、按标签筛选、新建/删除
- 自动保存功能 (防抖写入)

### Task 7: 字体导入功能
- 通过文件对话框选择 .ttf/.otf 字体文件
- 复制到 `data/fonts/` 目录并注册到 CSS
- 在编辑器工具栏中添加字体选择下拉菜单

### Task 8: 打包与测试
- 配置 electron-builder 替代方案: `tauri build`
- 设置应用图标、Windows 安装程序配置
- 最终功能测试与修复
