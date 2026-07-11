**简体中文**

<!-- markdownlint-disable -->

<div align="center">

<img src="./src-tauri/icons/icon.png" width="120" alt="Cyan Notepad 图标">

# Cyan Notepad 青の记事本

轻量、安静、可定制的 Windows 桌面记事与待办工具<br>
基于 Tauri v2 + React 19 + TypeScript 构建

[反馈问题](https://github.com/PyTs1n9/Cyan-Notepad/issues) · [更新日志](https://github.com/PyTs1n9/Cyan-Notepad/releases)<br>
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

## 项目简介

Cyan Notepad 是一个面向 Windows 桌面的本地优先工具箱：左侧管理笔记、分类和待办，右侧专注编辑与预览。它把 Markdown 记事、待办清单、桌面磁贴窗口、主题定制和系统托盘整合到一个轻量应用里，适合随手记录、整理资料、写草稿和维护日常任务。

所有数据默认保存在本机 `%APPDATA%/com.cyan-notepad.app/data/`，不会上传到任何服务器。

## 功能特点

### 待办事项

- 快速添加任务，支持低 / 中 / 高三档优先级。
- 支持完成、恢复、删除、内联编辑和拖拽排序。
- 支持任务置顶；置顶任务固定在列表顶部，避免误删或误拖动。
- 支持截止日期，可通过日历面板选择、修改或清除。
- 支持状态筛选（全部 / 进行中 / 已完成）和优先级筛选。

### Markdown 记事

- Markdown 作为主工作区，提供「源码 / 预览 / 分屏」三种视图。
- 分屏模式下源码和预览支持双向滚动同步。
- 支持 GitHub Flavored Markdown、自动换行、标题、列表、引用、代码块、分隔线、链接和图片语法。
- 历史富文本 HTML 笔记会在加载时转换为 Markdown，保留旧版本数据兼容性。
- 支持 `Ctrl+S` 手动保存，并可在设置里开启 10 秒 / 30 秒 / 1 分钟自动保存。
- 支持字数统计、保存状态提示、`Ctrl+滚轮` 调整编辑区字号。

### 笔记组织

- 支持新建、重命名、删除和拖拽排序分类。
- 默认提供「全部笔记」和「未分类笔记」入口。
- 支持将笔记拖拽到分类中，移动前会弹出确认。
- 支持笔记置顶；置顶笔记固定在分类列表顶部。
- 支持按 `#标签` 汇总筛选笔记。
- 支持导入 `.md` / `.markdown` / `.txt` 文件，导出当前笔记为 Markdown 或文本。

### 磁贴与便签窗口

- 可将当前笔记弹出为独立可编辑磁贴窗口，便于边看资料边记录。
- 支持只读磁贴预览窗口，适合把关键信息钉在桌面。
- 磁贴窗口支持置顶切换、字体缩放、双击标题栏关闭。
- 主窗口、磁贴窗口之间会同步内容和主题。

### 个性化与系统集成

- 主题预设：深色、蓝调、忧郁黄、清新绿。
- 支持自定义主背景、次背景、侧边栏、主文字和强调色，最多保存 5 套自定义配色。
- 支持中文 / English 即时切换。
- 支持自定义全局快捷键，默认 `Ctrl+Space` 显示或隐藏主窗口。
- 自定义标题栏、系统托盘、关闭到托盘、单实例运行。
- 关于窗口内可检查 GitHub 最新版本，并跳转 Releases 下载。
- 关于窗口包含友情赞助入口。

## v0.2.0 更新摘要

根据当前 release workflow，v0.2.0 重点更新包括：

- 新增设置里的自动保存选项。
- 新增笔记和待办置顶能力。
- 新增待办截止时间设置。
- 将 Markdown 变为主工作区，提供源码、预览、分屏三种模式。
- 新增笔记拖拽排序和分类管理。
- 新增友情赞助区域。
- 优化设置页、主工作区布局、待办筛选组件和整体 UI 尺寸。
- 合并 Markdown / Text 导入入口，合并导出入口。
- 修复软件多开、调试构建缓存堆积、MD 模式外链打开和新工作区 `Ctrl+S` 等问题。

> 吸附桌面边框模式仍未公开，当前版本关闭了相关入口。

## v0.2.1 更新摘要

- 修复切换界面语言后，侧边栏字段显示异常的问题。

## 快速开始

### 下载安装

请前往 [Releases 页](https://github.com/PyTs1n9/Cyan-Notepad/releases/latest) 下载最新版本。

| 系统 | 架构 | 推荐文件 |
| --- | --- | --- |
| Windows | x64 | Releases 页面中的 Windows 安装包或自包含可执行文件 |

下载后运行安装包或可执行文件即可使用。若同时提供多个文件，请优先选择最新版本号对应的 Windows x64 产物。

### 从源码构建

请参考 [README-dev.md](README-dev.md) 中的开发者文档进行环境配置、开发调试和打包发布。

## 数据存储

用户数据保存在本地应用数据目录：

```text
%APPDATA%/com.cyan-notepad.app/data/
├── todos.json          # 待办事项
├── fonts.json          # 自定义字体注册表
├── settings.json       # 主题、语言、自定义颜色、快捷键、自动保存设置
├── app-icon.png        # 自定义应用图标
└── notes/
    ├── index.json      # 笔记元数据和分类索引
    └── <uuid>.md       # 笔记内容，通常为 Markdown，兼容历史 HTML
```

备份时复制上述目录即可；恢复时拷回同一路径。

## 常见问题

**支持哪些操作系统？**
目前面向 Windows 桌面环境。

**笔记内容是什么格式？**
当前编辑器以 Markdown 为主。旧版本保存的 HTML 笔记会在打开时转换为 Markdown，内容文件仍使用 `.md` 扩展名。

**如何导入和导出？**
侧边栏提供合并后的导入入口，可选择 `.md`、`.markdown` 或 `.txt` 文件。导出会把当前笔记保存为 Markdown / 文本文件。

**关闭窗口后程序去哪了？**
普通关闭会隐藏到系统托盘；需要真正退出时，请使用托盘菜单的 Quit 或标题栏退出逻辑。

**为什么置顶笔记或置顶待办不能拖动 / 删除？**
这是当前版本的保护行为，用来避免重要内容被误操作。取消置顶后即可正常操作。

---

## 反馈与支持

- [提交 Issue](https://github.com/PyTs1n9/Cyan-Notepad/issues)
- 发送邮件至 1990629881@qq.com

## 许可证

[MIT](LICENSE)
