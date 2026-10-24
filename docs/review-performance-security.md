# 代码审查：性能与安全（2026-10-24）

范围：`src/`（渲染层）、`src-tauri/`（壳层与权限）、`supabase/migrations/`、`collab-server/`。
方式：静态阅读。本机无 GUI，未跑运行时验证，标注「待验证」的条目需要在真机确认。

结论速览：

| 级别 | 数量 | 主题 |
| --- | --- | --- |
| P0 | 4 | CSP 缺失、文件系统权限过宽、Markdown 任意本地文件读取、每键重写 index.json |
| P1 | 5（原 6，P1-4 已复核撤回） | 保存路径全量扫描、启动全量读盘、notes 单 store 引发的整树重渲染、协作服务器无速率限制、noteId 未校验拼路径 |
| P2 | 5 | 图片 MIME 放开到 svg、更新检查走 webview fetch、轮询与串行 IO 等 |

---

## P0-1　CSP 为 null，XSS 直接等于本地代码执行

**位置**：`src-tauri/tauri.conf.json` → `app.security.csp: null`

**问题**：整个 webview 没有任何内容安全策略。项目里有多条 `innerHTML` /
`dangerouslySetInnerHTML` 路径（`markdown.ts:351/368/373/385`、`App.tsx:139` 打印用
sheet、`CanvasView.tsx:1642`、`TileView.tsx:156`、`StickyNote.tsx:96/120`）。现在这些
点位的安全性完全依赖上游转义是否严密——`markdown.ts` 的 HTML 转义和链接/图片协议白
名单写得不错，但 CSP 缺失意味着「只要有一处漏掉，就变成可用的任意代码执行」，而不是
被浏览器拦掉。

放大因素：webview 与 Tauri IPC 同源，任何注入都能直接调 `plugin-fs` /
`plugin-http`（见 P0-2），拿到的不是「偷个 cookie」，而是「读写整块硬盘 + 任意发网
络请求」。

**修法**：在 `tauri.conf.json` 里给出显式 CSP。Tauri v2 会在构建时自动为 `script-src`
补 nonce/hash，但 `style-src` 需要 `'unsafe-inline'`（项目大量使用 inline style 属性
与 CSS 变量），`connect-src` 必须包含 `ipc:` 与 `http://ipc.localhost`，`img-src` 要放
行 `data:`（base64 内联）与 `asset:` / `http://asset.localhost`（`convertFileSrc`）：

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: asset: http://asset.localhost https:; media-src 'self' asset: http://asset.localhost; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://api.github.com; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"
```

注意顺序：先改 P2-2（GitHub 更新检查改走 `plugin-http`），否则 `connect-src` 收紧后
「检查更新」会静默失败。上线前必须逐条真机验证：图片内联、PDF 导出、CodeMirror、
自定义字体、协作 WebSocket（`wss://` 需加进 `connect-src`）。

---

## P0-2　`fs:scope` 与 `opener:allow-open-path` 放开了整块磁盘

**位置**：`src-tauri/capabilities/default.json`

```json
{ "identifier": "fs:scope", "allow": [
  { "path": "$APPDATA/**" }, { "path": "$EXE/**" },
  { "path": "$HOME/Desktop/**" }, { "path": "$HOME/Documents/**" },
  { "path": "$HOME/Downloads/**" }, { "path": "**" }   // ← 让上面几条全部失效
]},
{ "identifier": "opener:allow-open-path", "allow": [ ... { "path": "**" } ]}
```

**问题**：`"**"` 覆盖一切，等于把 `fs:allow-read-file` / `write-file` / `remove` /
`rename` 变成「对整个用户目录无限制」。同一份 capability 还授予了
`core:webview:allow-create-webview-window`。再叠加 `opener` 的 `"**"`，`open_path` 可
以启动任意可执行文件。

也就是说：一次注入（P0-1）→ 读浏览器凭据 / 写启动项 / 起 powershell，全链路无阻拦。

**修法**：把 scope 收到真正需要的目录。数据在 exe 同级 `data/`，导入导出走
`dialog` 返回的绝对路径（dialog 已授权，不需要 fs scope 兜底），所以列表可以收成：

```json
{ "identifier": "fs:scope", "allow": [
  { "path": "$RESOURCE/**" },
  { "path": "$RESOURCE/data/**" },
  { "path": "$EXE/**" },
  { "path": "$APPDATA/**" }
]}
```

`opener` 只保留 `openUrl` 用得到的 web 协议，去掉 `allow-open-path` 或把 allow 收成
`$RESOURCE/**`。改完后要回归：图片附件读写、回收站、字体导入、PDF/DOCX 导出到任意
用户选择路径（这类路径是 dialog 授权，不受 fs scope 约束——**需真机验证确认**）。

---

## P0-3　Markdown 图片解析可以读取任意本地文件

**位置**：`src/utils/markdown.ts:256-293`

```ts
const filePath = fileUrlToPath(decodedSource) ?? decodedSource;
let path = filePath;
if (!isAbsoluteFilePath(path)) {
  path = await join(dataDirectory, "notes", path);   // ← 没有 .. 校验
}
const bytes = await readFile(path);                  // ← 任意路径直接读
return `data:${imageMimeType(path)};base64,${bytesToBase64(bytes)}`;
```

**问题**：两处失控。

1. 绝对路径（`C:\...`、`file://`、`\\host\share`）原样交给 `readFile`，不限目录；
   相对路径 `join(data/notes, "../../../x")` 也没有规范化校验。于是任何一篇笔记（从别
   人那里导入、或未来云同步下发）只要写 `![](C:/Users/x/AppData/.../Login Data)`，就会
   被读进内存并转成 data URI 塞进 DOM。这不依赖 CSP 也能成立。
2. `readFile` 无大小上限，`bytesToBase64` 还会再放大 1.37 倍。指向一个 500MB 文件即
   可让渲染进程 OOM。

这跟同文件里 `resolveImageAttachment()`（`storage.ts:930`）的态度是矛盾的——那里写了
`^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$` 白名单和「never allow a Markdown link to escape the
data/img directory」，说明规则本来就有，只是没覆盖这条路径。

**修法**：只允许 `data/` 下（`notes/`、`img/`、`img-need/`、`img-trash/`）的路径。
先把 path 规范化成 `path.resolve` 语义（把 `\` 统一成 `/`，`a/../b` 折叠），再判断
前缀；绝对路径一律走 `attachment://` 协议而不是裸路径。同时加读取上限：

```ts
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

async function resolveLocalImagePath(source: string): Promise<string | null> {
  const decodedSource = decodeUrl(source.trim());
  const attachmentMatch = /^attachment:\/\/([^/?#]+)$/i.exec(decodedSource);
  if (attachmentMatch) { /* 原逻辑 */ }
  if (isAbsoluteFilePath(decodedSource)) return null;   // 裸绝对路径不再支持

  const dataDirectory = await getDataDirectory();
  const notesDir = await join(dataDirectory, "notes");
  const candidate = await join(notesDir, decodedSource);
  if (!isInsideDirectory(candidate, dataDirectory)) return null;

  const info = await stat(candidate);
  if ((info.size ?? 0) > MAX_INLINE_IMAGE_BYTES) return null;
  ...
}
```

（`isInsideDirectory` 用规范化后的字符串前缀比较，注意大小写与尾部分隔符。）

---

## P0-4　每敲一个键重写一次 `index.json`，且无串行化

**位置**：`src/App.tsx:559-566` + `src/components/Editor/NoteEditor.tsx:359-375` +
`src/utils/storage.ts:735-769`

链路：

```
handleMdChange（每次输入）
  → useNoteStore.updateNote(id, { content })      // notes 数组换新引用
    → App 的 useEffect([notes, categories]) 触发
      → saveNoteIndex(index, categories)
```

`saveNoteIndex` 每次做的事：读 `index.json`、读 `index.backup.json`、再读一次
`index.json`（复制到 backup）、写 `index.backup.json`、写 `index.json.tmp`、
`remove(index.json)`、`rename(tmp → index.json)`。**一次按键 ≈ 7 次文件 IO**，而且在
`remove` 与 `rename` 之间有 `await`（真实的挂起窗口），`index.json` 短暂不存在。

更糟的是临时文件名固定为 `notes/index.json.tmp`，且函数没有任何队列/互斥。连续快速输
入会让两次调用交错：A 写完 tmp，B 也写同一个 tmp，A `remove` 后 B `rename` 时源文件可
能已被 A 改名走 → 抛错，被 `catch` 吞掉，`index.json` 就真的没了，直到下一次保存。崩
溃发生在 `remove` 与 `rename` 之间同理。

**影响**：磁盘 IO 放大到「按键级」，SSD 寿命、CPU 唤醒、以及真实的数据完整性问题。

**修法**（两层，建议都做）：

1. 把 `saveNoteIndex` 的调用加去抖 + 串行队列（写在 `storage.ts` 内部，调用方无感）：

```ts
let indexSaveTimer: number | null = null;
let indexSaveInFlight: Promise<void> = Promise.resolve();
let pendingIndex: { notes: ...; categories: ... } | null = null;

export function scheduleNoteIndexSave(notes, categories): void {
  pendingIndex = { notes, categories };
  if (indexSaveTimer !== null) return;
  indexSaveTimer = window.setTimeout(() => {
    indexSaveTimer = null;
    const job = pendingIndex; pendingIndex = null;
    if (job) indexSaveInFlight = indexSaveInFlight.then(() => writeNoteIndex(job));
  }, 400);
}
```

   写入时用「唯一临时名」`index.json.${crypto.randomUUID()}.tmp`，并且**不要**先
   `remove` 目标（Rust 的 `rename` 在 Windows 上是 `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`，
   会覆盖；`plugin-fs` 的 rename 也是同一实现——**这点需真机确认一次**）。去掉
   `remove` 就没有了「目标消失窗口」。

2. 更根本的：`content` 不该在 `notes` 里（见 P1-3）。content 不进 store 之后，键击就
   完全不会触发 `saveNoteIndex`。

---

## P1-1　每次自动保存都全量扫描笔记目录

**位置**：`NoteEditor.tsx:196`、`NoteEditor.tsx:254`、`storage.ts:954-1020`

`doSave()` 与切换笔记时的 `persistPrevious()` 都在 `saveNoteContent` 之后立刻调用
`cleanupUnusedImageAttachments()`。这个函数的成本是：

- `readDir(notes)` + **逐个 `readTextFile` 全部 `.md` 正文**（只为扫 `attachment://` 引用）
- `readDir(img)` + 每个文件 `exists`/`rename`
- `readDir(img-trash)` + 每个文件 `stat`

200 篇笔记意味着每次自动保存 200+ 次读盘。自动保存是定时触发的，于是空转成本随笔记数
线性增长。

**修法**：只在「可能产生孤儿图片」的时机跑——删除笔记、删除/替换图片、清空回收站、
启动后空闲时（`requestIdleCallback`）。普通保存不需要。若一定要在保存后跑，至少改成
读 `index.json` 已知的 noteId 列表并跳过未改动的文件，或者用一个「引用计数表」增量维
护（保存时把该笔记的引用集从全局集合里替换掉，不需要读别人的正文）。

## P1-2　启动时把整个笔记库读一遍

**位置**：`storage.ts:704-733`

`loadNoteList()` 里 `recoverNoteListFromFiles(base)` 与两个 index 读取是并行发出的
`Promise.all`，也就是说**无论 index 是否完好，每次启动都会把所有 `.md` 全文读完**，只
为了 `getTitleFromContent()` 这个兜底标题，以及给 index 做「覆盖度」对比。

**修法**：先读 index；仅当 index 缺失/解析失败/条目数远小于目录里的文件数时，才回退到
全量扫描。覆盖度比较可以退化成「先 `readDir` 数文件名集合」，这一步不读正文。

## P1-3　`notes` 单 store 同时装元数据与正文，导致按键级整树重渲染

**位置**：`src/stores/noteStore.ts:121-150`、`src/components/Layout/NoteTree.tsx:113`

`updateNote` 每次都用 `state.notes.map(...)` 造新数组，而 `App.tsx:207` 订阅了
`notes`，`NoteTree` 的 `useMemo` 依赖也是 `notes`。结果：**每个字符**都会让 App 根组件
重渲染一次、`buildNoteTree` 重算一次（含排序、分组、搜索过滤）。

这是本次审查里对「输入手感」影响最大的一条，也是 P0-4 的根因。

**修法**：把正文从 `notes` 里拆出去。

```ts
// noteStore：notes 只留元数据（现在 saveNoteIndex 的入参就是元数据全集）
// 新增 noteContentStore：Record<noteId, string>，只被编辑器与 AI 模块订阅
```

编辑器持有本地 `mdContent` 状态，`updateNote` 只写元数据（标题派生时机从「每次输入」
改成「保存时」或「标题为空时输入第一行」）。这一步同时消掉 P0-4 的写盘放大。

## P1-4　~~RLS 没有校验 `access_level`~~　—— **已复核撤回，结论不成立**

> 撤回原因：本条引用的是 `202607190001_workspaces.sql` 的初版 policy。`202607220003_
> document_access_permissions.sql:312-358` 已经把 `documents_select_member` /
> `documents_update_editor` / `documents_delete_editor` 三条全部重写，均按
> `access_level` 收紧；`documents_insert_editor`（317-329）也限制了 editor 只能建
> `managers`/`members` 档。所以"viewer 能直读 creator 档正文""editor 能改任意文档"两条
> **都不成立**。`workspaceApi.ts:218` 的直连表更新同样受新版 policy 约束，不构成越权。
>
> 教训：审查 migration 必须看**最终态**（最后一条对该对象的 `drop policy if exists` +
> `create policy`），不能只看建表那一条。`202607220001:139` 也重写过 select policy，
> 最终生效的是 003 的版本。

撤回后只剩一个**产品语义疑点**，降级到 P2：`can_access_document()`（202607220003:39-55）
对 `creator` 档只允许 `owner`，不看 `created_by`；而 `set_document_access_level()` 也只
允许 owner 把档位设成 `creator`。合起来的实际语义是「creator 档 = owner 独占」，与档位
名字（"仅创建者可见"）不一致。现网没有非 owner 的 creator 档文档（editor 建不出来），
所以无实际越权，但若 UI 文案写的是"仅创建者可见"，改动 owner 后原作者会突然失去访问，
需要用产品文案对齐或补 `created_by = auth.uid()` 分支。**这不是安全修复，是语义澄清。**

## P1-5　协作服务器鉴权无速率限制，免费实例容易被刷

**位置**：`collab-server/src/index.ts:204-240`

`onAuthenticate` 每次连接都 `createClient()` 新建一个 Supabase 客户端再 `getUser(token)`
——未鉴权的握手也会走到这里（token 缺失时才在函数开头抛错）。没有 IP/连接速率限制，也
没有对 `admin` 查询做缓存。Render free + Supabase free 的配额都很低，随便一个循环就能
把实例打挂或把 Auth 请求额度烧完（还会触发 Supabase 的限流反过来影响正常用户）。

**修法**：

- `createClient` 提到模块级复用（用 anon key 的 client 无需每次新建）。
- 在 `onRequest` / `onConnect` 上做 per-IP 令牌桶（比如每 IP 10 次/分钟），超限直接断。
- 对 `getUser` 结果做一个短 TTL（30s）的 `Map<token, user>` 缓存。
- 记录并告警 `onAuthenticate` 失败率。

## P1-6　noteId 未校验就拼进路径

**位置**：`storage.ts:771-794`（`loadNoteContent` / `saveNoteContent`）、
`storage.ts:1022-1033`（`deleteNoteFile`），以及 `storage.ts:664-677` 信任
`index.json` 里的 `id`。

```ts
const path = await join(base, `${id}.md`);
```

同文件里 `conversationShardName()`（311-314）和 `resolveImageAttachment()`（930-933）都
做了白名单，说明是「漏了」而不是「有意」。目前 id 全部来自 `crypto.randomUUID()`，风险
可控；但 `index.json` 是可被外部改写的（备份恢复、将来云同步、用户手改），一旦出现
`"id": "../../../AppData/Roaming/.../evil"`，就会在 `fs:scope` 放开的前提下写到数据目录
之外。

**修法**：入口统一校验，把散落的规则收敛成一个函数：

```ts
function assertSafeNoteId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid note id");
  return id;
}
```

在 `loadNoteContent` / `saveNoteContent` / `deleteNoteFile` / `moveNoteToTrash` /
`restoreTrashNote` / `purgeTrashNote` 全部走它；`readNoteIndexFile` 里 filter 掉非法 id。

---

## P2 观察项

1. **`data:` 与本地 svg 都放行**（`markdown.ts:111`）。`<img src="data:image/svg+xml,...">`
   在 img 上下文不执行脚本，所以现在不是漏洞；但白名单里保留 `svg` 和本地 `.svg` 文件
   （`imageMimeType` 会给出 `image/svg+xml`）没有收益，建议只留位图。
2. **更新检查用 webview `fetch`**（`updateChecker.ts:67`），不是 `plugin-http`。收紧
   CSP 后必须换成 `httpFetch`，否则功能静默失效。
3. **`StickyNote` 状态用 500ms `setInterval` 轮询**（`NoteEditor.tsx:169-176`）。改成
   事件（`sticky:opened/closed` emit + listen），或至少只在窗口失焦时轮询。
4. **`loadAiConversations` 串行读 shard**（`storage.ts:338-342`，`for` 里 `await`）。
   会话多了启动会明显变慢，改成 `Promise.all` 限并发 8。
5. **`resetEditorContent` 触发 `editorSessionVersion` 自增重建编辑器**（`App.tsx` 外部
   保存事件 → `resetEditorContent`）。AI 每写一次笔记就把 CodeMirror 整棵重建，撤销历史
   丢失。建议改成 `view.dispatch` 局部替换。

## 已确认做得好的地方（避免过度改动）

- `markdown.ts` 对裸 HTML 的转义 + 链接/图片协议白名单，思路正确，注释也写清了威胁模型。
- `credentials.rs` 用 DPAPI（`CryptProtectData`）而不是自造加密，密钥文件只存 hex 密文，
  `SERVICE_ROLE_KEY` 只在服务端。
- `saveNoteContent` 之外的 AI 写笔记路径（`noteWrite.ts`）先做 `notes.find()` 存在性校
  验，模型拿不到任意路径；每次写前存快照，可回滚。
- `parseRoom` 的 UUID 严格校验、`onTokenSync` 二次校验身份与权限。
- RPC 全部 `security definer` + `set search_path = public` + `revoke execute from anon`。

## 建议动手顺序

实际执行顺序见 `docs/prompts-fix-performance-security.md`（按依赖和风险排成 4 批）。要点：

1. P0-3（任意文件读）与 P1-6（noteId 校验）—— 同一批，小改动，收益最大。
2. P0-4 止血 + P1-1 + P1-2 —— 写盘与扫描，一起做。
3. P0-2（fs scope）+ P0-1（CSP）—— 必须真机逐项回归，单独一批。
4. P1-5（协作服务器限流）。
5. P1-3（拆分 store）单列最后一批，因为它跨五个模块。

## 待你在真机确认的三件事

- `plugin-fs` 的 `rename` 在目标已存在时是否覆盖（决定要不要去掉 `remove` 前置）。
- 收紧 `fs:scope` 后，dialog 选中的导出路径是否仍可写。
- 加上 CSP 后，自定义字体、图片内联、CodeMirror、协作 WebSocket 是否都还正常。
