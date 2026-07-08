**简体中文**

<!-- markdownlint-disable -->

<div align="center">

<img src="./src-tauri/icons/icon.png" width="120" alt="Cyan Notepad 图标">

# Cyan Notepad 青の记事本

轻量、优雅、现代化的 Windows 桌面工具箱<br>
基于 Tauri v2 + React 19 + TypeScript 构建

[反馈问题](https://github.com/PyTs1n9/Cyan-Notepad/issues) · [更新日志](https://github.com/PyTs1n9/Cyan-Notepad/releases) <br>
[快速开始](#快速开始) · [从源码构建](#从源码构建)

[![Version](https://img.shields.io/github/v/release/PyTs1n9/Cyan-Notepad?label=版本)](https://github.com/PyTs1n9/Cyan-Notepad/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
</br>
![React 19](https://img.shields.io/badge/React-19-blue?logo=react)
![Tauri v2](https://img.shields.io/badge/Tauri-v2-%2324C8D8?logo=tauri)
![TypeScript](https://img.shields.io/badge/TypeScript-5-%233178C6?logo=typescript)

</div>

<!-- markdownlint-restore -->

---

## 为什么选择 Cyan Notepad

市面上许多笔记或待办工具，要么功能臃肿、启动缓慢，要么交互陈旧、缺乏现代化体验。Cyan Notepad 因此而生——它聚焦于**轻量随行、即时可用**，将待办管理、富文本笔记与桌面便签集成于一体，提供流畅、美观、可定制的使用体验。

## 功能特点

### 📋 待办事项

- **快速添加** — 输入内容 + 选择优先级（低/中/高），按 `Enter` 即刻添加
- **完成/恢复** — 点击圆圈标记完成，再次点击恢复未完成
- **内联编辑** — 点击任务标题直接修改，`Enter` 确认，`Escape` 取消
- **拖拽排序** — 拖拽左侧抓手图标，自由排列任务顺序
- **优先级循环切换** — 点击优先级标签按 低→中→高→低 快速切换
- **双维度筛选** — 状态筛选（全部/进行中/已完成）+ 优先级筛选（全部/低/中/高）

### 📝 富文本记事本

- **双模式编辑** — 所见即所得（WYSIWYG）与 Markdown 源码模式自由切换
- **MD 分屏预览** — 左侧源码编辑 + 右侧实时预览，双向滚动同步
- **丰富的排版能力** —
  标题 H1~H3、粗体、斜体、下划线、删除线、高亮、行内代码、引用块、列表、分隔线、
  文字颜色（取色器 + 快捷面板）、文本对齐（左/中/右）、字体选择、字号缩放（`Ctrl+滚轮`）
- **图片插入** — 支持本地图片自动转 Base64 内嵌
- **标签系统** — 编辑器中插入 `#标签`，侧栏按标签筛选笔记
- **导入导出** — 导入 `.md` / `.txt` 文件；导出为 Markdown 或纯文本
- **自动保存** — 800ms 防抖自动写入磁盘，亦可按 `Ctrl+S` 手动保存

### 📌 磁贴笔记

- **磁贴窗口** — 将当前笔记弹出为独立小窗口，始终置顶显示
  - 支持即时编辑，内容自动双向同步
  - `Ctrl+滚轮` 缩放字体（10px～32px）
  - 切换置顶/取消置顶，双击标题栏关闭
- **磁贴视图** — 弹出为只读磁贴窗口，适合快速查阅
- **主题同步** — 所有磁贴窗口自动跟随主窗口主题变化

### 🎨 主题定制

- **4 套预设** — 深色 / 蓝调 / 忧郁黄 / 清新绿，一键切换
- **自定义调色板** — 5 个颜色字段（主背景、次背景、侧边栏、主文字、强调色）自由搭配
- **预设管理** — 最多保存 5 个自定义配色方案，支持命名管理

### 🌐 国际化

- 中文 / English 全界面文本覆盖，即时切换

### ⚙️ 全局快捷键

- 自定义全局快捷键（默认 `Ctrl+Space` 显示/隐藏窗口），在设置弹窗中录制修改

### 🪟 系统集成

- 自定义标题栏（菜单栏 + 窗口控制按钮）
- 系统托盘 — 关闭时最小化到托盘
- 检查更新 — 通过 GitHub API 检测新版本并跳转下载

## 应用场景

- 日常待办清单，随手记录任务与优先级
- 快速记笔记、写草稿，双模式适应不同场景
- 将笔记钉在桌面角落，边看资料边记录
- 当作随时可唤出的剪贴板，暂存和复制文本

## 快速开始

### 下载安装

请前往 [Releases 页](https://github.com/PyTs1n9/Cyan-Notepad/releases/latest) 下载最新版本。

| 系统    | 架构 | 类型     | 文件名                                  |
| ------- | ---- | -------- | --------------------------------------- |
| Windows | x64  | 安装程序 | CyanNotepad_版本号_x64-setup.exe |

下载后双击运行安装程序，按提示完成安装即可启动使用。

### 从源码构建

请参考 [README-dev.md](README-dev.md) 中的开发者指南进行环境配置和构建。

## 数据存储

所有用户数据保存在本地，不会上传到任何服务器：

```
%APPDATA%/com.cyan-notepad.app/data/
├── todos.json          # 待办事项数据
├── fonts.json          # 自定义字体注册表
├── settings.json       # 主题、语言、自定义颜色、预设、快捷键
├── app-icon.png        # 自定义应用图标
└── notes/
    ├── index.json      # 笔记元数据索引
    └── <uuid>.md       # 笔记内容文件
```

> 💡 备份数据只需复制上述目录，恢复时拷回对应位置即可。

## 常见问题

**支持哪些操作系统？**
目前仅支持 Windows。

**笔记内容是什么格式？**
记事本模式下为 HTML（WYSIWYG），MD 模式下为纯 Markdown，两种模式可随时切换、自动转换。

**如何导入/导出文件？**
在记事本页面点击「导入 Markdown」或「导入 Text」导入文件；编辑区顶部点击「导出 MD」或「导出 TXT」导出笔记。

**什么是磁贴笔记？**
将笔记弹出为独立的小窗口，始终显示在其他窗口之上，适合边查资料边记录。内容自动与主窗口同步。

---

## 反馈与支持

- [提交 Issue](https://github.com/PyTs1n9/Cyan-Notepad/issues)
- 发送邮件至 1990629881@qq.com

## 许可证

[MIT](LICENSE)
