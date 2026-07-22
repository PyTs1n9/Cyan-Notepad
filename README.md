**简体中文**

<!-- markdownlint-disable -->

<div align="center">

<img src="./src-tauri/icons/icon.ico" width="155" alt="Cyan Notepad 图标">

# Cyan Notepad 青の记事本

记事本仅 <strong><em><font color="#1f6feb">13MB</font></em></strong>，轻量级桌面应用<br>
QQ 讨论群 <strong><em><font color="#1f6feb">902898359</font></em></strong><br>
本地优先的MD记事、待办、画布与在线协作工作台<br>
基于 **Tauri v2 + React 19 + TypeScript** 构建

[反馈问题](https://github.com/PyTs1n9/Cyan-Notepad/issues) · [更新日志](https://github.com/PyTs1n9/Cyan-Notepad/releases)<br>
[快速开始](#快速开始) · [在线工作台部署](#在线工作台部署) · [从源码构建](#从源码构建)

[![Version](https://img.shields.io/github/v/release/PyTs1n9/Cyan-Notepad?label=版本)](https://github.com/PyTs1n9/Cyan-Notepad/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</br>
![React 19](https://img.shields.io/badge/React-19-blue?logo=react)
![Tauri v2](https://img.shields.io/badge/Tauri-v2-%2324C8D8?logo=tauri)
![TypeScript](https://img.shields.io/badge/TypeScript-5-%233178C6?logo=typescript)

</div>

<!-- markdownlint-restore -->

---

## 项目简介

Cyan Notepad 是一个面向 Windows 桌面的轻量工作台。它把 Markdown 记事、待办清单、自由画布、桌面便签和可选的在线协作空间放在同一个应用中：本地内容无需登录即可使用，联网工作台则用于跨设备保存和多人协作。

当前版本为 **v0.4**。本地数据默认保存在应用数据目录；启用在线工作台后，账户、工作台元数据和云文档会通过你配置的 Supabase 与协作服务同步。

## 功能特点

### 📚 Markdown 记事本

- 1️⃣ 提供「源码」「预览」「分屏」三种 Markdown 视图，实时滚动同步
- 2️⃣ 支持包含Markdown编辑器的磁贴
- 3️⃣ 支持导入 `.md` / `.markdown` / `.txt`，并将当前笔记导出为 Markdown 或文本文件
- 4️⃣ 自定义自动保存和 Ctrl+S 手动保存
- 5️⃣ 粘贴本地图片时会保存为应用附件，并在预览中解析本地附件、文件路径和网络图片

<p align="center">
  <img src="./src-tauri/icons/test01.webp" width="600" alt="Cyan Notepad 图标">
</p>

### 🗓️ 待办清单

- 1️⃣ 支持创建多个任务清单，清单内任务隔离
- 2️⃣ 任务支持低 / 中 / 高三档优先级
- 3️⃣ 任务支持截止日期日历选择

<p align="center">
  <img src="./src-tauri/icons/test02.webp" width="600" alt="Cyan Notepad 图标">
</p>

### 🎨 自由画布

- 1️⃣ 支持创建多个本地画布
- 2️⃣ 支持粘贴、拖放或选择本地图片，也可以添加多行文本。
- 3️⃣ 支持将当前画布导出为 PNG、JPEG 或 SVG。
- 4️⃣ 画布内容和图片资源保存在本地，目前不参与在线工作台的实时协作。

<p align="center">
  <img src="./src-tauri/icons/test03.webp" width="600" alt="Cyan Notepad 图标">
</p>

### 💻 在线工作台与实时协作

- 1️⃣ 支持 Supabase 邮箱注册、登录、退出、密码修改，以及昵称和头像管理
- 2️⃣ 可创建工作台或通过邀请码加入工作台，并设置新成员默认角色
- 3️⃣ 实时编辑Markdown内容，实时显示在线用户，实时框选用户高光内容
- 4️⃣ 成员资料、头像变更和被移出工作台的通知会通过 Supabase Realtime 刷新。
- 5️⃣ 完整的数据库迁移、协作服务和 Render 部署说明见 [在线工作台部署](docs/online-workspace.md)。

<p align="center">
  <img src="./src-tauri/icons/test04.webp" width="600" alt="Cyan Notepad 图标">
</p>

### 💎 个性化与系统集成

- 1️⃣ 提供预设并支持自定义颜色主题，支持自定义背景
- 2️⃣ 支持中文 / English 即时切换
- 3️⃣ 提供 VS Code 样式活动栏，可折叠侧边栏
- 4️⃣ 自定义全局快捷键（默认 `Ctrl+Space` 显示/隐藏主窗口）
- 5️⃣ 关于窗口检查 GitHub 最新版本和 Releases 下载入口。

<p align="center">
  <img src="./src-tauri/icons/test05.webp" width="600" alt="Cyan Notepad 图标">
</p>

## 快速开始

### 下载安装

请前往 [Releases 页面](https://github.com/PyTs1n9/Cyan-Notepad/releases/latest) 下载最新版本。

| 系统 | 架构 | 推荐文件 |
| --- | --- | --- |
| Windows | x64 | Windows 安装包或自包含可执行文件 |

下载后运行安装包或可执行文件即可使用。普通关闭会将应用隐藏到系统托盘；需要真正退出时，请使用标题栏退出逻辑或托盘菜单中的 Quit。

### 从源码构建

请先阅读 [README-dev.md](README-dev.md) 了解开发环境、Tauri 构建和发布流程。常用命令如下：

```powershell
npm ci
npm run dev                 # 仅启动 Vite 前端
npm run tauri dev           # 启动完整 Tauri 桌面应用
npm run build               # TypeScript 检查并构建前端
npm run tauri build         # 构建 Windows NSIS 安装包
```

若要本地运行协作服务：

```powershell
npm run collab:dev
```

### 在线工作台部署

在线工作台是可选能力，不配置服务时不影响本地记事、待办和画布。部署时请按 [docs/online-workspace.md](docs/online-workspace.md) 的顺序执行 Supabase 迁移并启动协作服务。

桌面应用需要以下公开环境变量：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的 publishable key
VITE_COLLAB_URL=wss://你的协作服务域名
```

协作服务器还需要 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和仅服务器可见的 `SUPABASE_SERVICE_ROLE_KEY`。`service_role` 密钥不能写入桌面应用、提交到 Git 或放进安装包。

## 数据存储

应用会优先尝试使用安装包资源目录下的 `data/`；如果该目录不可写，则自动回退到 `%APPDATA%/com.cyan-notepad.app/data/`。开发模式默认使用后者。主要内容包括：

```text
data/
├── todos.json              # 待办任务
├── todo-lists.json         # 待办清单和当前清单
├── fonts.json              # 导入字体注册表
├── settings.json           # 主题、语言、背景、快捷键、自动保存等设置
├── app-icon.png            # 自定义应用图标
├── img/                    # 笔记图片附件
├── img-canvas/             # 画布图片资源
├── img-need/               # 头像和应用背景历史
├── img-trash/              # 待清理的图片资源
├── notes/
│   ├── index.json          # 笔记元数据和分类索引
│   └── <uuid>.md           # 笔记正文，兼容历史 HTML
└── canvas/
    ├── index.json          # 画布列表
    └── boards/*.json       # 画布内容
```

备份本地内容时复制整个 `data/` 目录即可。在线工作台的数据不在上述本地目录中，而是保存于你配置的 Supabase 和协作服务。

## 常见问题与限制

**支持哪些操作系统？** 目前发行包面向 Windows x64 桌面环境。

**不配置 Supabase 能使用吗？** 可以。本地记事、待办、画布、便签和主题功能不需要登录；只有在线工作台和账户功能需要 Supabase，实时编辑还需要可访问的 Hocuspocus 协作服务。

**工作台显示“后端未准备好”怎么办？** 请确认所有 Supabase 迁移已按顺序执行，并检查 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 和 `VITE_COLLAB_URL`。协作服务生产环境必须使用 `wss://`。

**在线文档可以离线编辑吗？** 编辑器会使用本地 IndexedDB 暂存协作状态，但实时同步需要网络和有效登录会话；没有网络时不要把它当作云端备份完成的信号。

**画布会同步到工作台吗？** 不会。画布是本地功能，云工作台只同步云文档。

**关闭窗口后程序去哪了？** 普通关闭会隐藏到系统托盘；使用托盘菜单的 Quit 或标题栏退出操作才会真正退出。

**旧笔记还能打开吗？** 可以。`.md` 文件可以是 Markdown，也可以包含旧版本保存的 HTML；加载时会转换为当前 Markdown 编辑格式。

---

## 反馈与支持

- [提交 Issue](https://github.com/PyTs1n9/Cyan-Notepad/issues)
- 发送邮件至 1990629881@qq.com

## 许可证

[MIT](LICENSE)
