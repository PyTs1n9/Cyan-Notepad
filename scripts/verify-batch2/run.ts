/**
 * Headless verification for batch 2 (index writes, image scan, boot recovery).
 *
 * Runs the real `src/utils/storage.ts` against a sandbox directory through the
 * mocked Tauri modules in this folder — no webview, no Rust, no real repo data.
 * Covers the three items from `docs/prompts-fix-performance-security.md` batch 2
 * that would otherwise need a human clicking around.
 *
 *   npm run verify:batch2
 */
import fsp from "node:fs/promises";
import path from "node:path";

import { sandboxRoot } from "./tauriPath";
import { calls, resetCalls } from "./tauriFs";
import {
  cleanupUnusedImageAttachments,
  loadNoteList,
  loadNoteContent,
  moveNoteToTrash,
  saveNoteContent,
  saveNoteIndex,
} from "../../src/utils/storage";
import { noteIndexFingerprint } from "../../src/utils/noteIndexFingerprint";
import { renderMarkdown } from "../../src/utils/markdown";

const DATA = path.join(sandboxRoot, "data");
const NOTES = path.join(DATA, "notes");
const IMG = path.join(DATA, "img");
const IMG_TRASH = path.join(DATA, "img-trash", "notes");
const NOTE_TRASH = path.join(DATA, "trash", "notes");
const INDEX = path.join(NOTES, "index.json");
const INDEX_BACKUP = path.join(NOTES, "index.backup.json");

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  checks += 1;
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

async function exists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resetData(): Promise<void> {
  await fsp.rm(DATA, { recursive: true, force: true });
  await fsp.mkdir(NOTES, { recursive: true });
  await fsp.mkdir(IMG, { recursive: true });
}

const ISO = "2026-10-24T00:00:00.000Z";

function meta(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id.toUpperCase(),
    tags: [] as string[],
    categoryId: null,
    pinned: false,
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

async function scenarioBootRecovery(): Promise<void> {
  console.log("\n[1] 启动只读缺失的笔记正文（P1-2 差集补录）");
  await resetData();
  await fsp.writeFile(path.join(NOTES, "a.md"), "# Alpha\nbody a", "utf8");
  await fsp.writeFile(path.join(NOTES, "b.md"), "# Beta\nbody b", "utf8");
  await fsp.writeFile(path.join(NOTES, "c.md"), "# Gamma", "utf8");
  await fsp.writeFile(
    INDEX,
    JSON.stringify({ notes: [meta("a", { order: 0 }), meta("b", { order: 1 })], categories: [] }),
    "utf8",
  );

  resetCalls();
  const listed = await loadNoteList();
  const mdReads = calls.readTextFile.filter((file) => file.toLowerCase().endsWith(".md"));

  check("3 篇笔记（index 里的 2 篇 + 补录 1 篇）", listed.notes.length === 3, listed.notes.map((n) => n.id));
  check("只读了 1 个正文（缺失的那篇）", mdReads.length === 1, mdReads);
  check("读的正是 c.md", mdReads[0]?.endsWith("c.md") ?? false, mdReads);
  check("补录标题来自正文", listed.notes.find((n) => n.id === "c")?.title === "Gamma",
    listed.notes.find((n) => n.id === "c")?.title);
  check("补录顺序按目录位置（c 在最后）",
    [...listed.notes].sort((x, y) => x.order - y.order).at(-1)?.id === "c",
    listed.notes.map((n) => `${n.id}:${n.order}`));
}

async function scenarioBootFullScan(): Promise<void> {
  console.log("\n[2] index 全丢时回退全量扫描（保底能力不能丢）");
  await resetData();
  await fsp.writeFile(path.join(NOTES, "x.md"), "# Xray\nbody x", "utf8");
  await fsp.writeFile(path.join(NOTES, "y.md"), "# Yankee\nbody y", "utf8");

  resetCalls();
  const listed = await loadNoteList();
  const mdReads = calls.readTextFile.filter((file) => file.toLowerCase().endsWith(".md"));
  check("2 篇都恢复", listed.notes.length === 2, listed.notes.map((n) => n.id));
  check("全量扫描读了 2 个正文", mdReads.length === 2, mdReads);
}

async function scenarioFingerprint(): Promise<void> {
  console.log("\n[3] 索引指纹（P0-4 止血的核心）");
  const notes = [meta("a", { tags: ["x"], order: 0 })];
  const categories = [{ id: "cat", name: "工作", order: 0, parentId: null, pinned: false }];
  const base = noteIndexFingerprint(notes as never, categories as never);

  const typed = [{ ...notes[0], content: "敲了 20 个字", updatedAt: "2026-10-24T09:00:00.000Z" }];
  check("只改正文 + updatedAt → 指纹不变（不写盘）",
    noteIndexFingerprint(typed as never, categories as never) === base);
  check("改标题 → 指纹改变", noteIndexFingerprint([{ ...notes[0], title: "新标题" }] as never, categories as never) !== base);
  check("改标签 → 指纹改变", noteIndexFingerprint([{ ...notes[0], tags: ["x", "y"] }] as never, categories as never) !== base);
  check("改 pinned → 指纹改变", noteIndexFingerprint([{ ...notes[0], pinned: true }] as never, categories as never) !== base);
  check("拖动排序（order）→ 指纹改变", noteIndexFingerprint([{ ...notes[0], order: 9 }] as never, categories as never) !== base);
  check("重命名分类 → 指纹改变",
    noteIndexFingerprint(notes as never, [{ ...categories[0], name: "项目" }] as never) !== base);
}

async function scenarioConcurrentIndexWrites(): Promise<void> {
  console.log("\n[4] 并发写 index.json（P0-4 第二个问题：无串行化会丢索引）");
  await resetData();
  const jobs = Array.from({ length: 20 }, (_, index) =>
    saveNoteIndex([meta(`n${index}`, { order: index })] as never, []));
  const settled = await Promise.allSettled(jobs);
  const rejected = settled.filter((item) => item.status === "rejected");

  check("20 次并发写入全部成功", rejected.length === 0, rejected.length);
  const parsed = JSON.parse(await fsp.readFile(INDEX, "utf8")) as { notes: { id: string }[] };
  check("index.json 是合法 JSON", Array.isArray(parsed.notes));
  check("保留最后一次写入的内容", parsed.notes[0]?.id === "n19", parsed.notes.map((n) => n.id));
  const leftovers = (await fsp.readdir(NOTES)).filter((name) => name.endsWith(".tmp"));
  check("没有残留 .tmp 文件", leftovers.length === 0, leftovers);
  check("备份文件已生成", await exists(INDEX_BACKUP));
}

async function scenarioImageCleanup(): Promise<void> {
  console.log("\n[5] 孤儿图片回收（P1-1 改动后仍有回收路径）");
  await resetData();
  await fsp.writeFile(path.join(IMG, "used.png"), "u", "utf8");
  await fsp.writeFile(path.join(IMG, "orphan.png"), "o", "utf8");
  await fsp.writeFile(path.join(NOTES, "n1.md"), "![](attachment://used.png)", "utf8");

  await cleanupUnusedImageAttachments();
  check("被引用的图片保留在 img/", await exists(path.join(IMG, "used.png")));
  check("孤儿图片进入 img-trash/notes/", await exists(path.join(IMG_TRASH, "orphan.png")));
}

async function scenarioSaveNoLongerScans(): Promise<void> {
  console.log("\n[6] 普通保存不再扫描图片目录（P1-1 核心）");
  await resetData();
  await fsp.writeFile(path.join(IMG, "stale.png"), "s", "utf8");
  await fsp.writeFile(path.join(NOTES, "n2.md"), "![](attachment://stale.png)", "utf8");

  resetCalls();
  await saveNoteContent("n2", "正文已删掉图片引用");
  const imgDirTouched = calls.readDir.filter((dir) => dir.toLowerCase().includes("img"));
  check("保存过程没有 readDir 图片目录", imgDirTouched.length === 0, imgDirTouched);
  check("图片没有被立刻隔离（留到下次启动清理）",
    await exists(path.join(IMG, "stale.png")) && !(await exists(path.join(IMG_TRASH, "stale.png"))));
}

async function scenarioDeleteNoteStillCleans(): Promise<void> {
  console.log("\n[7] 删除笔记仍即时回收其图片（保留的两处调用）");
  await resetData();
  await fsp.writeFile(path.join(IMG, "kept.png"), "k", "utf8");
  const body = "![](attachment://kept.png)";
  await fsp.writeFile(path.join(NOTES, "n3.md"), body, "utf8");

  const moved = await moveNoteToTrash({
    id: "n3",
    title: "N3",
    content: body,
    tags: [],
    categoryId: null,
    pinned: false,
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
  });
  check("moveNoteToTrash 返回 true", moved === true, moved);
  check("正文进入回收站", await exists(path.join(NOTE_TRASH, "n3.md")));
  check("图片进入回收站", await exists(path.join(NOTE_TRASH, "img", "kept.png")));
  check("notes/ 下的正文已移除", !(await exists(path.join(NOTES, "n3.md"))));
}

async function scenarioContentRoundTrip(): Promise<void> {
  console.log("\n[8] 保存后能原样读回（写盘链路没被串行化破坏）");
  await resetData();
  const body = "# 标题\n\n正文内容 with 中文";
  await saveNoteContent("rt", body);
  check("内容一致", (await loadNoteContent("rt")) === body);
}

/**
 * Replays what `App.tsx`'s auto-save effect does per render: the only thing left
 * out is React calling it. Proves the "20 keystrokes, one write" claim directly
 * instead of by reading the code.
 */
async function scenarioTypingDoesNotRewriteIndex(): Promise<void> {
  console.log("\n[9] 连打 20 个字符只写一次 index.json（P0-4 用户可感知的部分）");
  await resetData();
  type Row = ReturnType<typeof meta> & { content: string };
  let store: Row[] = [{ ...meta("a", { title: "Alpha" }), content: "" } as Row];
  let lastFingerprint: string | null = null;
  let indexWrites = 0;

  const runAutoSaveEffect = async () => {
    const fingerprint = noteIndexFingerprint(store as never, []);
    if (lastFingerprint === fingerprint) return;
    lastFingerprint = fingerprint;
    indexWrites += 1;
    const index = store.map(({ content: _content, ...metadata }) => metadata);
    await saveNoteIndex(index as never, []);
  };

  await runAutoSaveEffect(); // 首次挂载
  for (let key = 0; key < 20; key += 1) {
    store = [{ ...store[0], content: `${store[0].content}字`, updatedAt: new Date(Date.now() + key * 1000).toISOString() }];
    await runAutoSaveEffect();
  }
  check("20 次按键后仍然只有 1 次写盘", indexWrites === 1, indexWrites);

  store = [{ ...store[0], title: "改个名" }];
  await runAutoSaveEffect();
  check("改标题立刻再写一次", indexWrites === 2, indexWrites);
}

/**
 * Batch 1 leftovers that are testable without a webview: note ids reaching the
 * filesystem, and the image resolver's "never read a file outside the data
 * directory" rule.
 */
async function scenarioNoteIdWhitelist(): Promise<void> {
  console.log("\n[10] noteId 白名单（批次 1 / P1-6）");
  await resetData();
  // Trap: a readable file one level up. `id="../../evil"` would hit it.
  await fsp.writeFile(path.join(DATA, "evil.md"), "should not be read", "utf8");

  resetCalls();
  const escaped = await loadNoteContent("../../evil");
  check("读路径遇到非法 id 返回空串", escaped === "");
  check("没有为非法 id 读盘", calls.readTextFile.length === 0, calls.readTextFile);

  let threw = false;
  try {
    await saveNoteContent("../evil", "x");
  } catch {
    threw = true;
  }
  check("写路径遇到非法 id 抛错", threw);

  // An index hand-edited to contain an escaping id must not reach the tree.
  await fsp.writeFile(
    INDEX,
    JSON.stringify({
      notes: [meta("ok-id"), { ...meta("bad"), id: "../../../AppData/evil" }],
      categories: [],
    }),
    "utf8",
  );
  const listed = await loadNoteList();
  check("index 里的非法 id 被过滤", listed.notes.length === 1 && listed.notes[0].id === "ok-id",
    listed.notes.map((n) => n.id));
}

async function scenarioImageResolution(): Promise<void> {
  console.log("\n[11] 笔记图片解析的安全边界（批次 1 / P0-3）");
  await resetData();
  // A file the resolver must never read, sitting next to the data directory.
  const outside = path.join(sandboxRoot, "secret.png");
  await fsp.writeFile(outside, "TOP-SECRET", "utf8");

  await fsp.writeFile(path.join(NOTES, "local.png"), "png-bytes", "utf8");
  const hugePath = path.join(NOTES, "huge.png");
  await fsp.writeFile(hugePath, "");
  await fsp.truncate(hugePath, 25 * 1024 * 1024);

  resetCalls();
  const relative = await renderMarkdown("![a](local.png)");
  check("data 目录内的相对路径可以内联", relative.includes("data:image/png;base64,"), relative.slice(0, 80));

  resetCalls();
  const escape = await renderMarkdown("![a](../../../secret.png)");
  check("相对路径逃出 data 目录被拒", !escape.includes("data:image") && !escape.includes("TOP-SECRET"));
  check("没有读 data 目录外的文件",
    calls.readFile.every((file) => file.replace(/\\/g, "/").includes("/data/")), calls.readFile);

  resetCalls();
  const absolute = await renderMarkdown("![a](C:/Windows/win.ini)");
  check("绝对路径不再被 readFile 内联", !absolute.includes("base64") && calls.readFile.length === 0,
    calls.readFile);
  check("数据目录外的绝对路径不再生成 asset URL", !absolute.includes("asset.localhost"), absolute.slice(0, 140));
  check("改为可见占位（不再是坏图 <img>）",
    absolute.includes("markdown-external-image") && !absolute.includes("<img"), absolute.slice(0, 140));
  check("占位里保留了原始路径（tooltip 用）",
    absolute.includes("C:/Windows/win.ini") || absolute.includes("C:\\\\Windows\\\\win.ini"),
    absolute.slice(0, 140));

  resetCalls();
  const huge = await renderMarkdown("![a](huge.png)");
  check("超过 20MB 的图片不内联", !huge.includes("base64"), huge.slice(0, 80));

  resetCalls();
  const badAttachment = await renderMarkdown("![a](attachment://../../CONFIG)");
  check("attachment 协议拒绝越界文件名", !badAttachment.includes("base64"));

  resetCalls();
  const assetAgain = await renderMarkdown("![a](http://asset.localhost/x.png)");
  check("asset URL 二次渲染保持幂等", assetAgain.includes("http://asset.localhost/x.png"),
    assetAgain.slice(0, 120));
}

async function main(): Promise<void> {
  console.log(`sandbox: ${DATA}`);
  await scenarioBootRecovery();
  await scenarioBootFullScan();
  await scenarioFingerprint();
  await scenarioConcurrentIndexWrites();
  await scenarioImageCleanup();
  await scenarioSaveNoLongerScans();
  await scenarioDeleteNoteStillCleans();
  await scenarioContentRoundTrip();
  await scenarioTypingDoesNotRewriteIndex();
  await scenarioNoteIdWhitelist();
  await scenarioImageResolution();

  console.log(`\n${failures === 0 ? "ALL PASS" : "FAILED"} — ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

void main();
