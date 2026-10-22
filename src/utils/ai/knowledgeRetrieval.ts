/**
 * Unified local knowledge base retrieval ("小青" mode).
 *
 * Corpus = 功能手册 +《常见问答》(bundled Markdown) + user notes (+便签/磁贴,
 * which share note content) + todos + canvas text. One BM25 index over all of
 * it (`manualEngine`), rebuilt on demand: writes mark the index dirty via
 * `knowledgeDirty`, and a TTL catches writes made outside this process.
 *
 * The vector (embedding) layer fuses in through `vectorIndex` with RRF when
 * its model files are available; when not, retrieval degrades to pure BM25 —
 * same interface, same hit shape, callers cannot tell the difference.
 */

import manualRaw from "../../../docs/user-manual.md?raw";
import faqRaw from "../../../docs/user-faq.md?raw";
import {
  loadNoteContent,
  loadNoteList,
  loadTodos,
  loadTodoLists,
} from "@/utils/storage";
import { loadCanvasBoard, loadCanvasList } from "@/utils/canvasStorage";
import { isCanvasRichTextItem, type CanvasBoard } from "@/types/canvas";
import type { Todo } from "@/types";
import {
  createManualIndex,
  type ManualChunk,
  type ManualHit,
  type ManualIndex,
} from "./manualEngine";
import {
  clearKnowledgeDirty,
  consumeDirtyCanvasIds,
  consumeDirtyNoteIds,
  isKnowledgeDirty,
} from "./knowledgeDirty";
import { fuseHits, isVectorReady } from "./vectorIndex";

/** Chunks are kept short so a top-1 hit reads as one digestible answer block. */
const CHUNK_CHAR_LIMIT = 370;
/** Rebuild when dirty, or when this much time passed since the last build. */
const INDEX_TTL_MS = 30_000;
const DEFAULT_MAX_HITS = 5;

interface CorpusDoc {
  /** Chunk heading, e.g. "笔记：周报" / "待办：工作" / "画布：天天". */
  heading: string;
  text: string;
}

/** Pack paragraphs into segments of at most `limit` chars (never mid-word cut). */
function segmentText(text: string, limit = CHUNK_CHAR_LIMIT): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const segments: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) segments.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > limit) {
      push();
      // Long paragraph: cut on sentence boundaries, then hard-cut as a last resort.
      let rest = paragraph;
      while (rest.length > limit) {
        const window = rest.slice(0, limit);
        const cutAt = Math.max(
          window.lastIndexOf("。"),
          window.lastIndexOf("！"),
          window.lastIndexOf("？"),
          window.lastIndexOf("；"),
          window.lastIndexOf(". "),
        );
        const end = cutAt > limit * 0.5 ? cutAt + 1 : limit;
        segments.push(rest.slice(0, end).trim());
        rest = rest.slice(end);
      }
      if (rest.trim()) segments.push(rest.trim());
      continue;
    }
    if (current && current.length + paragraph.length + 1 > limit) {
      push();
    }
    current = current ? `${current}\n${paragraph}` : paragraph;
  }
  push();
  return segments;
}

function docsToMarkdown(docs: CorpusDoc[]): string {
  return docs
    .flatMap((doc) =>
      segmentText(doc.text).map((segment) => `## ${doc.heading}\n${segment}`),
    )
    .join("\n\n");
}

/**
 * Cached note bodies. Every save marks the index dirty, so a rebuild happens
 * on the question that follows any edit — re-reading every note file from disk
 * on each of those rebuilds dominated the pre-answer latency. `saveNoteContent`
 * names the note it wrote, so only that body is re-read.
 */
const noteTextCache = new Map<string, string>();
const canvasTextCache = new Map<string, string>();

async function collectUserDocs(): Promise<CorpusDoc[]> {
  const docs: CorpusDoc[] = [];

  // Notes (便签/磁贴 are note windows — content is note content).
  try {
    const { notes, categories } = await loadNoteList();
    const changed = consumeDirtyNoteIds();
    const liveIds = new Set(notes.map((note) => note.id));
    for (const cachedId of [...noteTextCache.keys()]) {
      if (!liveIds.has(cachedId)) noteTextCache.delete(cachedId);
    }
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    await Promise.all(
      notes.map(async (note) => {
        let content = noteTextCache.get(note.id);
        if (content === undefined || changed.has(note.id)) {
          content = (await loadNoteContent(note.id)).trim();
          noteTextCache.set(note.id, content);
        }
        const title = note.title.trim() || "无标题";
        const folder = note.categoryId ? categoryName.get(note.categoryId) : null;
        const heading = folder ? `笔记：${folder} > ${title}` : `笔记：${title}`;
        const tags = note.tags.length > 0 ? `标签：${note.tags.join("、")}` : "";
        const text = [tags, content].filter(Boolean).join("\n\n");
        // Empty notes still enter the index with a placeholder body: the chunk
        // parser drops heading-only blocks, so a title-less body would make the
        // note invisible to title queries like "切换到《故事》".
        docs.push({ heading, text: text || "（内容为空）" });
      }),
    );
  } catch (e) {
    console.error("knowledge: notes unavailable", e);
  }

  // Todos: one doc per list so list names answer "我记过什么" queries.
  try {
    const [todos, listData] = await Promise.all([loadTodos<Todo>(), loadTodoLists()]);
    const listName = new Map((listData?.lists ?? []).map((l) => [l.id, l.name]));
    const byList = new Map<string, Todo[]>();
    for (const todo of todos) {
      const key = todo.listId ?? "";
      const bucket = byList.get(key);
      if (bucket) bucket.push(todo);
      else byList.set(key, [todo]);
    }
    for (const [listId, items] of byList) {
      const name = listName.get(listId) ?? "待办";
      const text = items
        .map((todo) => `- ${todo.completed ? "✓ " : ""}${todo.title}`)
        .join("\n");
      if (text) docs.push({ heading: `待办：${name}`, text });
    }
  } catch (e) {
    console.error("knowledge: todos unavailable", e);
  }

  // Canvas text (text + shape items carry copy). Same body cache as notes:
  // `saveCanvasBoard` names the board it wrote.
  try {
    const canvases = await loadCanvasList();
    const changed = consumeDirtyCanvasIds();
    const liveIds = new Set(canvases.map((doc) => doc.id));
    for (const cachedId of [...canvasTextCache.keys()]) {
      if (!liveIds.has(cachedId)) canvasTextCache.delete(cachedId);
    }
    await Promise.all(
      canvases.map(async (doc) => {
        let text = canvasTextCache.get(doc.id);
        if (text === undefined || changed.has(doc.id)) {
          text = boardText(await loadCanvasBoard(doc.id));
          canvasTextCache.set(doc.id, text);
        }
        if (text) docs.push({ heading: `画布：${doc.name}`, text });
      }),
    );
  } catch (e) {
    console.error("knowledge: canvas unavailable", e);
  }

  return docs;
}

function boardText(board: CanvasBoard | null): string {
  if (!board) return "";
  return board.items
    .filter(isCanvasRichTextItem)
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

let index: ManualIndex | null = null;
let builtAt = 0;

async function buildIndex(): Promise<ManualIndex> {
  // Cleared *before* the awaited collection: a write landing while this build
  // runs must leave the flag set, so the next question rebuilds again instead
  // of serving an index that was assembled from a half-updated corpus.
  clearKnowledgeDirty();
  const userDocs = await collectUserDocs();
  const corpus = `${manualRaw}\n\n${faqRaw}\n\n${docsToMarkdown(userDocs)}`;
  const next = createManualIndex(corpus);
  index = next;
  builtAt = Date.now();
  return next;
}

/** Rebuild when a content write marked the index stale, or on TTL expiry. */
export async function refreshKnowledgeIndex(): Promise<ManualIndex> {
  if (!index || isKnowledgeDirty() || Date.now() - builtAt > INDEX_TTL_MS) {
    return buildIndex();
  }
  return index;
}

/**
 * Retrieve ranked hits from the whole local knowledge base. The vector channel
 * is optional: if the embedding worker fails or times out, the BM25 ranking is
 * returned as-is, so a turn never loses its context over the semantic channel.
 */
export async function searchKnowledge(
  query: string,
  maxHits = DEFAULT_MAX_HITS,
): Promise<ManualHit[]> {
  const bm25 = await refreshKnowledgeIndex();
  const bm25Hits = bm25.search(query, maxHits * 2);
  if (!isVectorReady()) return bm25Hits.slice(0, maxHits);
  try {
    return await fuseHits(query, bm25Hits, bm25.chunks, maxHits);
  } catch (error) {
    console.warn("ai: semantic fusion failed, using BM25 only", error);
    return bm25Hits.slice(0, maxHits);
  }
}

export type { ManualChunk, ManualHit };
