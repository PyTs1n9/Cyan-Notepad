# 修复提示词：性能与安全（P0 + P1，不含 P1-3）

来源：`docs/review-performance-security.md`。本文件把修复方案拆成 4 批，每批一个独立可投喂的提示词。

## 使用方式

1. 按批次顺序投喂，**每批跑完停下来等你真机验证，验证通过再投下一批**。
2. 批次之间有依赖：批次 3 的 CSP 依赖批次 1 已经把本地图片改成 asset 协议。不要跳序。
3. 每段提示词都是自包含的，直接整段复制给新会话即可，不需要贴本文件的其他部分。
4. 已按你的选择固定：P0-3 走 asset 协议、P1-3（拆分 store）不在本轮、SQL 不产出也不执行。
5. 报告里的 P1-4（RLS 未校验 access_level）在写本文件时复核后**已撤回**——`202607220003:312-358` 早已按档位收紧，详情见报告对应段落。批次 4 因此只剩协作服务器一条。

批次总览：

| 批次 | 内容 | 改动面 | 风险 |
| --- | --- | --- | --- |
| 1 | P1-6 noteId 白名单、P0-3 本地图片改 asset 协议 | 2 个文件 | 低（tsc 可验） |
| 2 | P0-4 索引写盘止血、P1-1 保存路径取消全量扫描、P1-2 启动不全量读盘 | 3 个文件 | 中（写盘行为变化） |
| 3 | P0-2 fs scope 与 opener 收紧、P0-1 加 CSP | 2 个配置文件 | **高（必须真机全量回归）** |
| 4 | P1-5 协作服务器鉴权限流（P1-4 已复核撤回，不产出 SQL） | 1 个服务文件 | 低 |

---

## 批次 1 提示词

````text
你在 Qing Notepad 仓库里做两处安全修复。仓库：D:\Code\Qing-Notepad（Tauri v2 + React 19 + TypeScript 的 Windows 桌面笔记应用）。

【纪律，先读】
1. 下面每条都给了"复核方法"。你必须先复核问题是否真实存在，再动手。复核不成立的条目直接跳过，并在报告里说明"不成立 + 证据"。禁止凭描述直接改。
2. 只改本批列出的问题。不要顺手重构、不要调整代码风格、不要动与本批无关的文件。
3. 本机没有 GUI，你无法运行桌面窗口来验证渲染效果。禁止声称"已测试图片显示正常"。静态可确认的用 tsc/build 确认，运行时的列入"必须人工验证"。
4. 不要执行 npm install（dev 进程可能在跑，会撕裂提升包）。

【任务 A：noteId 进入路径前必须校验】

现象：src/utils/storage.ts 里有 6 处把 noteId 直接拼进文件路径，没有任何字符校验：
- loadNoteContent / saveNoteContent：`join(base, `${id}.md`)`
- deleteNoteFile、moveNoteToTrash、restoreTrashNote、purgeTrashNote：同类拼接
- readNoteIndexFile：把 index.json 里的 id 原样信任

同一个文件里 conversationShardName() 和 resolveImageAttachment() 都做了白名单，说明这是遗漏而非有意为之。当前 id 全部来自 crypto.randomUUID()（含连字符），所以现状可利用性低；但 index.json 可被备份恢复、将来的云同步、或用户手改污染。

复核：grep 出所有拼 `${id}.md` 或 `join(base, id` 的位置，确认我列的 6 处是否准确、有没有遗漏（比如 canvasStorage.ts 里同类拼接也一并处理）。

要求：
1. 新增一个内部函数：
   ```ts
   /** Note ids reach the filesystem, so they are validated at every entry. */
   function assertSafeNoteId(id: string): string {
     if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`Invalid note id: ${id}`);
     return id;
   }
   ```
2. 读路径（loadNoteContent）遇到非法 id 返回空字符串并 console.warn，不要抛错——避免一条脏数据让启动崩掉。
3. 写/删路径（saveNoteContent、deleteNoteFile、moveNoteToTrash、restoreTrashNote、purgeTrashNote）直接抛错，让调用方感知。
4. readNoteIndexFile 解析后 filter 掉非法 id 的条目，并 console.warn 一次总数。
5. canvas 侧若有同样的 id 拼路径，按同一规则处理（先 grep 确认）。

【任务 B：本地图片不再 readFile+base64，改用 asset 协议】

现象：src/utils/markdown.ts 的 resolveLocalImagePath() 对绝对路径（`C:\...`、`file://`、UNC）和相对路径（`join(data/notes, path)`）都不做目录限制，直接 readFile 后 bytesToBase64 成 data URI。两个后果：任何笔记里写 `![](C:/Users/x/AppData/.../Login Data)` 就能把任意本地文件读进 DOM；且没有大小上限，指向大文件会 OOM（base64 再放大 1.37 倍）。

复核：静态读该函数确认上面两点。若你有 GUI 环境，可写一条含 `![](C:/Windows/win.ini)` 的笔记看渲染结果是否出现 base64 数据；没有 GUI 就以静态确认为准，并在报告标注"未运行时复现"。

要求：把渲染路径改成 asset 协议，把路径权限交给 src-tauri/tauri.conf.json 里已有的 assetProtocol.scope（$APPDATA/$EXE/$RESOURCE）。越界路径由 WebView 返回 403，不再进入 JS 内存。

关键：**渲染路径和导出路径要分开处理，不能一刀切。**

1. 渲染路径（NoteEditor 预览、StickyNote、TileView、AiSidebar 都调 renderStoredNoteContent / renderMarkdown）：
   - 绝对路径、file:// 路径、data 目录内的相对路径，统一 `convertFileSrc(absolutePath)` 返回，不再 readFile。
   - 相对路径仍然要先和 data 目录 join，并做一次规范化校验：拼出来的路径必须仍在 data 目录内（自己比较字符串前缀，注意 Windows 大小写不敏感和尾部分隔符）。不满足返回 null。
   - attachment:// 分支保持现状（它本来就是 convertFileSrc + `#attachment=` marker），不要改。
   - 保留一个大小上限（stat 后判断，建议 20MB），超限返回 null，避免超大图把 WebView 卡死。
2. 导出路径（**必须保留 data URL**）：
   - src/utils/exportDocx.ts 的 DocxBuildOptions 注释明确写着 "Note body already rendered to HTML, with local images resolved to data URLs"，docx/html 只认 data URL；PDF 导出（App.tsx 的 mountPrintSheet → renderStoredNoteContent）同理需要能被 WebView2 打印引擎加载的图。
   - 所以新增一个独立的导出专用函数（例如 `resolveLocalImageToDataUrl()`），仍然 readFile + base64，但**必须**限制在 data 目录内 + 8MB 上限。App.tsx 的 PDF 导出和 DOCX 导出路径改为调用它。
   - 不允许让导出继续走无限制的 readFile。
3. 幂等性：isNonFileImageSource() 现在只放行 http/data/blob///about/#，改完后必须放行 `asset:` 和 `http://asset.localhost`。否则二次渲染会把 asset URL 当成相对路径再拼一次 data 目录，图片全挂。
4. 顺手删掉因此变成死代码的 bytesToBase64 / imageMimeType——只有确认没有其他调用点后再删。

【验收】
- `node node_modules/typescript/bin/tsc --noEmit` 必须 0 错误（用这个写法，不要用 npx，本机 PowerShell 策略会挡 npx.ps1）。
- `npm run build` 必须成功。注意：这条要用 PowerShell 跑，不要在 Git Bash 里跑。
- grep 断言：src/utils/markdown.ts 里渲染路径不再出现 `readFile(`；storage.ts 里 6 处 id 拼接都经过 assertSafeNoteId。

【报告格式】
✅ 批次 1 完成
- 复核结论：A 成立/不成立（证据），B 成立/不成立（证据）
- 改动文件：逐个列 路径 + 一句话说明
- 验收：tsc 输出、build 输出
- 必须人工验证：笔记里的本地图片是否正常显示、DOCX 导出是否还有图、PDF 导出是否还有图、便签窗口图片是否正常
- 未做或跳过的条目 + 理由
````

**本批真机验证清单**：笔记中三种图片源（`attachment://`、相对路径、绝对路径）是否都能显示；DOCX 导出后图是否还在（注意 `droppedImages` 只打 console.warn，不会提示用户）；PDF 导出后图是否还在；便签与磁贴窗口图片是否正常。

---

## 批次 2 提示词

````text
你在 Qing Notepad 仓库里做三处性能修复。仓库：D:\Code\Qing-Notepad（Tauri v2 + React 19 + TypeScript）。

【纪律，先读】
1. 每条都给了复核方法。先复核再动手，不成立就跳过并说明证据。
2. 只改本批三处。不要顺手把 content 从 noteStore 拆出去（那是下一批的事），不要改 store 结构。
3. 本机没有 GUI，禁止声称跑过界面测试。
4. 不要执行 npm install。

【任务 A：堵住"每敲一键就重写 index.json"】

路径：src/components/Editor/NoteEditor.tsx 的 handleMdChange → useNoteStore.updateNote({ content }) → src/App.tsx:559-566 的 useEffect([notes, categories]) → saveNoteIndex()。

现象：saveNoteIndex（src/utils/storage.ts）每次执行 = 读 index.json、读 index.backup.json、再读一次 index.json、写 backup、写 index.json.tmp、remove(index.json)、rename(tmp → index.json)，约 7 次文件 IO。而 notes 数组在每次按键时都换新引用，所以上述 IO 是"按键级"的。

附带的第二个问题：tmp 文件名固定为 `index.json.tmp`，函数没有任何队列或互斥。两次调用重叠时（按键速度远快于文件 IO），可能 A 已把 tmp 改名走、B 再 rename 时源文件不存在 → 抛错被 catch 吞掉 → index.json 消失。

复核：静态读链路确认 A 的第一点（handleMdChange 是否真的每次输入都调 updateNote，App 的 effect 依赖是否真的包含 notes）。第二点是并发推断，无 GUI 环境无法复现，按"无法验证但成本极低"处理，直接做防御性修复，并在报告里标注未复现。

要求（两个方案，优先 A）：
1. 方案 A（推荐）：在 App.tsx 的 effect 里做元数据指纹比对，内容变化不触发写盘。
   - 指纹只取元数据字段：id、title、tags、categoryId、pinned、order。**不要包含 updatedAt**（updateNote 每次都会刷新它，包含进去等于没做）。
   - 用 useRef 保存上次指纹，相同就直接 return。
   - 写入时仍然写最新的 updatedAt，所以时间戳最多滞后到下一次元数据变化，不影响语义。
2. 方案 B（若你判断指纹方案有遗漏）：给 saveNoteIndex 加 400ms debounce + flush 导出。必须同时接上 flush 调用点（App 的 handleQuit 路径），否则托盘退出会丢最后一次索引更新。若采用 B，必须在报告里写明这个残留风险。
3. 无论 A 还是 B，都要改 saveNoteIndex 内部：
   - tmp 文件名带上唯一后缀（`index.json.<randomUUID>.tmp`），避免并发写同一个文件。
   - 用一条 Promise 链串行化所有写入（模块级 `let chain: Promise<void>`），后一次等前一次落盘。
   - 关于是否去掉 `remove(index.json)` 再 rename：Rust 的 fs::rename 在 Windows 上是 MoveFileEx(MOVEFILE_REPLACE_EXISTING)，理论上可覆盖。**你必须先实测**（写个临时 node/tauri 脚本或在 dev 里试），确认能覆盖再去掉那步 remove；不能确认就保留 remove，但因为有串行链，交错问题已经消失。
4. App.tsx 里 `saveNoteIndex(index, categories)` 现在是裸调用，返回的 Promise 没有 void 也没有 catch，会变成未处理的 rejection。改掉。

【任务 B：保存路径上取消全量图片扫描】

现象：cleanupUnusedImageAttachments()（src/utils/storage.ts:954）会 readDir(notes) 并把**每个 .md 的正文都读一遍**、再 readDir(img)、readDir(img-trash) + 逐个 stat。它的调用点有 5 处：
- NoteEditor.tsx:196（doSave 内，每次自动保存）
- NoteEditor.tsx:254（切换笔记时保存上一篇）
- StickyNote.tsx:141（便签自动保存）
- storage.ts:1029、1200（删除笔记 / 清空回收站）

前三条是"普通保存"路径，等于自动保存定时器每触发一次就把整个笔记库扫一遍，成本随笔记数线性增长。

复核：grep 确认调用点清单是否与我给的一致。

要求：
1. 删掉 NoteEditor.tsx:196、NoteEditor.tsx:254、StickyNote.tsx:141 三处调用。
2. 保留 storage.ts 内部两处（删除笔记 / 清空回收站时清理）。
3. 新增一个"低优先级清理"入口：应用启动后延迟执行一次（requestIdleCallback，降级 setTimeout 5s），避免孤儿图片永久堆积。
4. 删除后必须确认没有"孤儿图片永远不回收"的路径：现在图片是在哪里被移入 img-trash 的？读一下周边代码，如果图片的删除依赖这个函数，就要在图片删除动作里补一次定点清理（只处理被删的那张，不做全量扫描）。

【任务 C：启动时不要无条件全量读盘】

现象：loadNoteList()（src/utils/storage.ts:704-733）用 Promise.all 并行发起 readNoteIndexFile(primary)、readNoteIndexFile(backup)、recoverNoteListFromFiles(base)。第三个会遍历 notes 目录把每个 .md 正文读出来，只是为 getTitleFromContent() 算兜底标题和补录 index 里没有的条目。所以无论 index 是否完好，每次启动都是 O(全部笔记正文) 的读取。

复核：读该函数确认 Promise.all 的三件事，以及 recoverNoteListFromFiles 的具体职责。

要求（注意别把功能删掉）：
1. recoverNoteListFromFiles 还承担"index 缺条目时补录孤立 .md"的职责（崩溃后写入了 .md 但 index 没更新）。这条能力必须保留。
2. 改成差集补录：先 readDir(notes) 只拿文件名集合（不读正文），与 index 里的 id 集合比对；只对差集里的文件读正文做补录。index 完全缺失/解析失败时才退回全量扫描。
3. 保持"primary 坏了用 backup"的优先级逻辑不变。

【验收】
- `node node_modules/typescript/bin/tsc --noEmit` 0 错误。
- `npm run build` 成功（用 PowerShell 跑，不要 Git Bash）。
- grep 断言：cleanupUnusedImageAttachments 在 NoteEditor.tsx 和 StickyNote.tsx 里不再出现。

【报告格式】
✅ 批次 2 完成
- 复核结论：A/B/C 各成立与否 + 证据
- 采用的方案：A 还是 B，为什么
- rename 覆盖实验：结论 + 你用的验证方式
- 改动文件：路径 + 一句话
- 验收：tsc、build 输出
- 必须人工验证：连续输入 20 个字符后 index.json 的修改时间是否只变了一次；新建/改名/拖动排序笔记后重启，顺序与标题是否保持；删除笔记后对应图片是否被回收
- 未做或跳过的条目 + 理由
````

**本批真机验证清单**：连续打字时用资源监视器或 `Get-Item data/notes/index.json | Select LastWriteTime` 观察写入次数是否从"每键一次"降到"元数据变化时才写"；新建笔记、重命名、拖动排序后立刻强杀进程再启动，检查顺序和标题是否还在；删除带图片的笔记后确认 `data/img` 里的文件进入 `img-trash`。

---

## 批次 3 提示词

````text
你在 Qing Notepad 仓库里收紧 Tauri 权限并加 CSP。仓库：D:\Code\Qing-Notepad（Tauri v2）。

【本批风险最高，先读纪律】
1. 这两项改完必须由人工在真机上逐条回归。你无法验证任何界面行为，禁止声称"功能正常"。
2. 必须分两步做，每步单独报告，不要一次改完：先只改 opener（任务 A1），报告后停下；等人工确认再改 fs scope（A2）和 CSP（任务 B）。
3. 禁止为了让某个功能跑通就把 `{"path": "**"}` 或 `csp: null` 加回去。跑不通就如实报告是哪条路径被挡。
4. 不要执行 npm install。

【前置】确认批次 1 已完成：src/utils/markdown.ts 的渲染路径已经在用 convertFileSrc（asset 协议）。若还没改，先停下报告。

【任务 A：收紧 capabilities】

文件：src-tauri/capabilities/default.json

现象（两处）：
```json
{ "identifier": "fs:scope", "allow": [
  { "path": "$APPDATA/**" }, { "path": "$EXE/**" },
  { "path": "$HOME/Desktop/**" }, { "path": "$HOME/Documents/**" },
  { "path": "$HOME/Downloads/**" }, { "path": "**" }        // ← 让上面几条全部失效
]}
{ "identifier": "opener:allow-open-path", "allow": [ ... { "path": "**" } ] }
```
`"**"` 等于整盘可读写 + 可启动任意 exe。与 CSP 缺失叠加后，一次注入就能读凭据、写启动项、执行任意程序。

A1（第一步，只做这个）：把 opener 的 `"**"` 换成 `{ "path": "$RESOURCE/**" }`。应用里 openUrl 走的是 web 协议（src/utils/externalLinks.ts 有 http/https 白名单），open_path 只需要指向自带资源。改完跑 tsc/build，停下报告。

A2（第二步，等人工确认 A1 后再做）：fs scope 收到：
```json
{ "identifier": "fs:scope", "allow": [
  { "path": "$RESOURCE/**" },
  { "path": "$EXE/**" },
  { "path": "$APPDATA/**" }
]}
```

关键背景（别删这两条，也别自己加回 HOME 目录）：
- 数据目录 = resourceDir()/data（见 src/utils/storage.ts:96-100 的注释：resourceDir() 就是安装后可执行文件所在目录）。NSIS 安装下 $RESOURCE 与 $EXE 是同一个目录，dev 下是 src-tauri/target/debug，两种情况都被这两条覆盖。所以 `$RESOURCE/**` + `$EXE/**` 足以覆盖 data 目录，**dev 模式也能跑**——这点你必须自己确认一遍再下手。
- 用户导入的字体、自定义背景、头像都拷进 data/img-need，也在 scope 内。

A2 的真实风险（必须逐条回归，不能只看能不能启动）：
Tauri v2 里 dialog 插件返回的绝对路径**不一定**会自动加入 fs scope。以下五条路径用的是用户通过 dialog 选的、data 目录之外的文件，收紧后可能全部失败：
1. 导入 Markdown 笔记（App.tsx handleImportTextNotes，readTextFile 用户选的文件）
2. 导出 DOCX（App.tsx:901 save() → writeFile(exportPath)）
3. 导出 PDF（同一路径）
4. 导入自定义字体
5. 选择自定义背景图

如果实测失败，按这个顺序试，不要加回 `**`：
- 首选：引入 tauri-plugin-persisted-scope（Rust `tauri-plugin-persisted-scope` + JS 侧无需代码），它会把 dialog 选中的路径持久化进 fs scope。注意 Cargo.toml 里"JS/Rust 插件必须同 minor 版本"的注释约束。
- 备选：Rust 侧新增一个 `read_text_file_at(path)` / `write_file_at(path, bytes)` 命令，把导入导出收进后端，前端不再需要 scope 外访问。

【任务 B：加 CSP】

文件：src-tauri/tauri.conf.json → app.security.csp（现在是 null）

起点（不是终点，按实际资源逐项调整）：
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: asset: http://asset.localhost https:;
media-src 'self' asset: http://asset.localhost;
font-src 'self' data: asset: http://asset.localhost;
connect-src 'self' ipc: http://ipc.localhost wss: https:;
object-src 'none';
frame-src 'none';
base-uri 'self';
form-action 'none'
```

每一项都是被现有代码逼出来的，改之前先对着源码确认：
- `ipc:` + `http://ipc.localhost`：Tauri v2 的 IPC 通道，缺了所有 invoke 全挂。
- `style-src 'unsafe-inline'`：项目大量用内联 style 属性和 CSS 变量（--shell-top-gap 等），去掉会整页错位。
- `img-src` 的 `data:`：markdown 内联图与头像缓存；`asset:` + `http://asset.localhost`：批次 1 改成 asset 协议后的本地图片；`https:`：profiles.avatar_url 是用户可控的远端 URL（src/components/UserAvatar.tsx）。
- `font-src` 的 `asset:`：自定义字体是通过 `@font-face { src: url(f.path) }` 注入的（App.tsx:374），f.path 是 asset URL。
- `connect-src` 的 `wss:`：协作服务地址来自构建期变量 VITE_COLLAB_URL（CloudNoteEditor.tsx:701）。`https:` 是协作健康检查（useCollaborationNetwork 用 webview fetch）。
- 更新检查 src/utils/updateChecker.ts:67 用的是 webview fetch 打 api.github.com。收紧后要么在 connect-src 放行 `https://api.github.com`，要么把它改成走 plugin-http（推荐后者，收窄面）。两种都可以，但必须在报告里说明你选了哪个。

要求：
1. 先按上面起点写进去，跑 `npm run build`，然后交给人工回归。
2. 在报告里列出"每一项为什么存在"的对照表，方便人工判断哪些能删。
3. script-src 保持 `'self'` 即可，Tauri 构建期会自动注入 nonce/hash，不要手写 nonce 或加 'unsafe-inline'/'unsafe-eval'。
4. 不要加 `report-uri`（没有上报端点）。

【验收】
- `node node_modules/typescript/bin/tsc --noEmit` 0 错误。
- `npm run build` 成功（PowerShell 跑）。
- 若要出安装包：先 `. .\env.ps1` 载入 MSVC 环境再 `npm run tauri build`。注意 tauri build 退出码 1 可能是 PowerShell 把 stderr 的 Info/Warn 包装成 NativeCommandError，判定成功要读 "Finished 1 bundle at"。

【报告格式】
批次 3-A1 / 3-A2 / 3-B 分三次报告，每次：
- 改动内容 + diff 摘要
- 验收输出
- 必须人工验证：逐条列出（A2 的五条 dialog 路径 + B 的全部界面功能）
- 若某条被挡住：是哪个资源、报什么错、你打算怎么解
````

**本批真机验证清单**：启动是否白屏；导入 `.md`、导出 DOCX、导出 PDF、导入字体、选背景图五条 dialog 路径；笔记图片三种源；自定义字体是否生效；协作空间能否连接（wss）；检查更新能否返回结果；托盘、便签、磁贴窗口是否正常；AI 对话能否请求（走 plugin-http，不受 connect-src 影响，但要在 CSP 下确认 IPC 未被挡）。

---

## 批次 4 提示词

````text
你在 Qing Notepad 仓库里加固协作服务器。仓库：D:\Code\Qing-Notepad。

【背景更正，先读】
本批原本还包含"补 RLS 的 access_level 校验"，该结论在写提示词时已复核撤回，**不在本批范围内**：
supabase/migrations/202607220003_document_access_permissions.sql:312-358 已经重写了
documents_select_member / documents_update_editor / documents_delete_editor，三条都按
access_level 收紧；documents_insert_editor（317-329）也限制了 editor 只能建 managers/members
档。所以你不需要、也不许再去改这些 policy。报告里用一句话确认即可（说明你读过 312-358 行），
不要产出任何 SQL 文件。

【纪律】
1. 只改 collab-server/src/index.ts。不要动前端、不要动 supabase/migrations、不要连线上库。
2. 先复核问题是否成立，不成立就跳过并说明证据。
3. 不要执行 npm install（collab-server 有自己的 node_modules）。

【任务：协作服务器鉴权无速率限制】

文件：collab-server/src/index.ts

现象：
- onAuthenticate（约 204-240 行）每次连接都 `createClient()` 新建一个 Supabase 客户端，再 `getUser(token)`。未鉴权的握手也会走到这里，等于把 Auth 的查询成本暴露给任何能建立 WebSocket 的人。
- 没有任何限流或缓存。Render free + Supabase free 的配额都低，一个循环就能把实例或 Auth 额度打满，还会触发 Supabase 限流反过来影响正常用户。

复核：读该函数确认"每连接新建 client"与"无缓存无限流"两点；并顺手确认 onTokenSync（约 242-270 行）是否在做同样的重复查询。

要求：
1. anon 的 supabase client 提到模块级复用（现在每次 new 一个）。
2. getUser 结果加短 TTL 缓存：`Map<token, { user, expiresAt }>`，TTL 60s，条目上限 1000，超限时清最早过期的。onTokenSync 走同一份缓存。
   注意：onTokenSync 的语义是"刷新后的 token 必须重新校验身份"，所以缓存命中时仍要保持 `data.user.id === context.userId` 这个断言，不能只信缓存内容。
3. 加限流，但**不要按 IP**：Render 有反向代理，`request.socket.remoteAddress` 在代理后不可信，按 IP 限流等于全局限流。改用两个维度：
   - 全局并发闸门：同时在飞的 getUser 请求不超过 20，超出直接拒绝并返回明确错误。
   - 失败计数：对同一个 token 连续鉴权失败做 5 分钟冷却（Map，上限 5000 条，定期清理），挡住重复撞库。
4. 所有新增的 Map 都要有清理逻辑（定时或惰性），避免长跑进程内存泄漏。
5. 返回给客户端的错误不要泄露内部细节：现在 `throw documentError || memberError` 会把 Supabase 原始错误直接抛给客户端。改成对外统一文案，细节只写服务端日志。

【验收】
- `node node_modules/typescript/bin/tsc --noEmit` 0 错误（前端部分不受影响，用来确认没有误伤）。
- collab-server 按其自有 tsconfig 做一次类型检查；不要连真实 Supabase 做集成测试。

【报告格式】
✅ 批次 4 完成
- 复核结论：限流缺失是否成立 + 证据；RLS 那条确认已撤回（一句话 + 你读到的行号）
- 改动点：新增的内存结构、TTL、上限、清理策略
- 验收输出
- 必须人工验证：部署后在客户端连续快速重连 20 次是否被闸门挡住、正常连接是否不受影响
- 未做或跳过的条目 + 理由
````

**本批人工动作**：部署到 Render 后手工压测一次——用客户端反复断开重连 20 次，确认正常用户不受影响、异常重连会被并发闸门挡住；同时看 Supabase Auth 的请求量曲线是否不再随连接数线性上涨。

---

## 不在本轮：P1-3（把 content 从 notes 里拆出去）

按你的选择，这项单列下一批。它是 P0-4 的根因（`notes` 单 store 同时装正文，导致每次输入都换数组引用 → App 根组件与 NoteTree 整树重渲染），但改动会横跨 editor / AI / sticky / tile / 检索五个模块。本批已经有 CSP 和 fs scope 两个必须真机回归的高风险项，不建议叠加跨模块重构——出问题时很难分清是 CSP 挡住了资源还是 store 拆分漏了订阅。批次 1-3 验证通过后，再单独开一轮写它的提示词。
