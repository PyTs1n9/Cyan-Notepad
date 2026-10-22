/**
 * BM25 smoke over the bundled manual + FAQ corpus (the retrievable part of
 * the knowledge base). Run after every corpus edit to confirm each sample
 * question still top-1s its own section and no new chunk steals queries.
 *
 *   node --experimental-strip-types scripts/smoke-manual-bm25.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createManualIndex } from "../src/utils/ai/manualEngine.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = [
  readFileSync(join(root, "docs/user-manual.md"), "utf8"),
  readFileSync(join(root, "docs/user-faq.md"), "utf8"),
].join("\n\n");
const index = createManualIndex(corpus);

/** Query → regex the top-1 chunk heading must match. */
const cases: Array<[string, RegExp]> = [
  // The sidebar's 12 sample questions (zh, `aiExampleQ1..Q12`):
  ["怎么把笔记导出为 PDF？", /Q18/],
  ["关闭窗口后程序去哪了？", /Q13/],
  ["如何备份我的笔记？", /数据存储与备份/],
  ["怎么把笔记导出为 Word 文档？", /Q18/],
  ["笔记能按标签分类吗？", /Q12/],
  ["怎么同时打开多篇笔记？", /Q7/],
  ["删掉的笔记能恢复吗？", /Q9/],
  ["便签和磁贴有什么区别？", /Q8/],
  ["怎么自定义全局快捷键？", /(个性化设置|快捷键)/],
  ["怎么切换深色主题？", /(个性化设置|主题)/],
  ["换电脑后怎么迁移笔记？", /Q5/],
  ["待办能设优先级吗？", /待办清单/],
  // The note-write permission section (Q19) must own its own phrasing:
  ["AI 能直接修改我的笔记吗？", /Q19/],
  ["怎么让 AI 帮我改笔记？", /Q19/],
  ["AI 修改错了怎么办？", /Q19/],
  ["助手能改笔记吗？", /Q19/],
  // 联网搜索 (Q20) must own its phrasing without stealing Q2's 搜索 question:
  ["联网搜索怎么开？", /Q20/],
  ["怎么开启联网搜索？", /Q20/],
  ["联网搜索要另外收费吗？", /Q20/],
  ["搜索要花钱吗？", /Q20/],
  ["怎么搜索笔记？能搜正文吗？", /Q2/],
];

let failures = 0;
for (const [query, expected] of cases) {
  const top = index.search(query, 3)[0];
  const heading = top?.chunk.heading ?? "（无命中）";
  const ok = Boolean(top && expected.test(heading));
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${query}\n      top-1: ${heading}  [${top ? top.score.toFixed(2) : "-"}]`);
}
console.log(
  failures === 0
    ? `\nOK: ${cases.length}/${cases.length} queries hit their section.`
    : `\n${failures}/${cases.length} queries missed their section.`,
);
process.exit(failures === 0 ? 0 : 1);
