# 导出 Word / PDF 选型记录

请求：笔记本页「传送门 → 导出文件」在现有 Markdown / Text 之外新增 `.docx` 与 `.pdf`。

## 已确认的前提

| 项 | 结论 | 理由 |
| --- | --- | --- |
| 入口形态 | 沿用单按钮，`dialog.save` 的 filters 增加 Word、PDF，按保存路径扩展名分派 | `filters` 本身就是格式选择器；传送门面板宽 304px，note 分组已有 5 个按钮，再加两个会挤压 |
| Word 保真度 | 结构还原：标题样式、段落、列表、任务列表、引用、代码块、表格、图片；颜色/高亮尽力映射，不做逐像素还原 | 表格与图片必须有，否则用户判定"导出坏了"；CSS → OOXML 的样式翻译收益低、坑多 |
| PDF 保真度 | 完整还原（走排版引擎，非截图） | 由选型决定，见下 |
| 图片缺失 | 跳过并统计，导出结束后提示"有 N 张图片未能导出" | 导出是一次性动作，静默中断会让用户丢掉整次操作 |
| 范围 | 仅本地笔记页；云端文档编辑器不动 | 云端导出要经过协作层与权限，失败模式不同，混在一起放大回归面 |

## 结论一：PDF → WebView2 `PrintToPdf`（Tauri 侧 Rust 命令）

**做法**：`src-tauri` 新增 `export_pdf` command，`PlatformWebview::controller()` 取 `ICoreWebView2Controller`，
转 `ICoreWebView2_7::PrintToPdf`，用 `ICoreWebView2Environment6::CreatePrintSettings()` 设 A4 与页边距，
完成回调经 `mpsc` channel 回传结果并带超时；前端在调用前挂载独立打印容器，`@media print` 隐藏应用外壳。

**理由**：

1. 产物是真正的文字型 PDF —— 可搜索、可选中、可复制，这是"交付文档"的基本要求。
2. 不引入任何前端运行时依赖：`webview2-com 0.38` 与 `wry 0.55.1` 同版本，已在依赖树中，不增加二进制体积。
3. 中文、表格、图片、代码块走完整排版引擎，与屏幕预览一致。

**放弃的方案**：

- `html2canvas` + `jspdf`：改动最小，但输出是图片，不可搜索，PDF 体积大；且 `html2canvas` 最新版 1.4.1 发布于 2022-01-22，已近四年未更新（`npm registry` 实测）。
- `window.print()` + 打印样式：零依赖，但弹 WebView2 打印面板，用户需手工选「Microsoft Print to PDF」并填路径，文件名不可预设，与 md/txt 的"选路径 → 得文件"流程不一致。

**风险与对策**：

- 打印对象是当前窗口 → 用独立 `.print-sheet` 容器 + `@media print` 隐藏外壳，避免把侧边栏印进去。
- `ICoreWebView2_7` 需要 WebView2 运行时 ≥ 92 → 取接口失败时返回明确错误，不回退到截图方案。
- `PrintToPdf` 是异步回调 → channel + 30s 超时，命令用 `async` + `spawn_blocking`，不阻塞主线程。

## 结论二：Word → `docx` npm + 自建 HTML→OOXML 映射

**做法**：新增 `src/utils/exportDocx.ts`，先用 `renderStoredNoteContent` 把笔记正文渲染成 HTML（图片已解析为
data URL），再交给 `docx/html` 的 `htmlToContent` 转成 Word 内容，最后 `Packer.toBlob` 得到 `Uint8Array` 写盘。

**实施时的修正**：`docx` 9.13 自带 `docx/html` 子模块（`htmlToContent`），读取 `<style>`、`style` 属性与
`@media print` 规则，把标题、列表、表格、图片、复选框、代码块直接映射到 Word 样式，并通过 `onWarning` 报告
`missing-image` / `unsupported-image`。实测（`data/notes` 真实笔记 + 任务列表/表格/图片/缺图用例）：
`w:tbl`、`numPr`、`word/media/*.png`、复选框 XML 均正确生成，缺图触发 `missing-image`。
因此不再手写 400 行映射层，改为「一份针对笔记排版调优的 CSS + `htmlToContent`」，缺失图片计数直接来自 `onWarning`。

**体积处理**：`docx` 打包后约 723KB（gzip 223KB），改为 `handleExportActiveNote` 内动态 `import()`，
主包维持 2,015KB（gzip 622KB）不变，未导出 Word 的用户不承担这部分体积。

**理由**：

1. `docx` 9.13.0 是唯一仍活跃（2025-06 仍在发版）、且明确支持浏览器的方案。
2. 标题能用 Word 内置 Heading 样式，导航窗格可用；表格转真表格，图片 base64 内嵌，代码块等宽 + 灰底。
3. 映射层在自己手里，样式出问题可定位，而不是黑盒转换。

**放弃的方案**：

- `html-to-docx`：1.8.0 发布于 2023-03，无 `browser` 字段，依赖 `jszip / lodash / virtual-dom / xmlbuilder2`，
  面向 Node 流，渲染进程里不可用。
- Rust `docx-rs`：Rust 侧要重新解析 HTML，同一件事维护两套解析逻辑，回归面翻倍。

## 待定 / 后续

- 云端文档（`CloudNoteEditor`）的导出，后续单独走一轮，需要先定权限与失败回滚。
- 画布已有 PNG 导出，不在此次范围。
- Word 里的任务列表降级为符号列表（`☐ / ☑`），若后续要求真复选框，需要插入 `w:sym` 或表单域。
