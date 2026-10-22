/**
 * Vector retrieval layer + RRF fusion over the BM25 results.
 *
 * Embeddings run in a Web Worker (`vectorWorker.ts`, bge-small-zh-v1.5 int8).
 * When the worker/model is unavailable the layer reports `!isVectorReady()`
 * and the knowledge retriever falls back to pure BM25 — retrieval never
 * breaks, it only loses the semantic recall channel.
 *
 * Chunk vectors are cached across queries (keyed by heading+text) and filled
 * incrementally, so per-query cost is one query embedding + cosine scan.
 */

import type { ManualChunk, ManualHit } from "./manualEngine";

/** RRF constant; 60 is the standard choice and needs no tuning. */
const RRF_K = 60;
/**
 * Chunks are embedded in small batches with a per-batch deadline. Batching
 * keeps a single slow/hung model call from blocking the whole turn, and an
 * aborted batch only costs the chunks it covered — the next query retries the
 * rest, so the cache fills up progressively instead of all-or-nothing.
 */
const CHUNK_BATCH = 32;
const CHUNK_BATCH_TIMEOUT_MS = 10_000;
const QUERY_EMBED_TIMEOUT_MS = 10_000;

interface ChunkVector {
  key: string;
  vector: number[];
}

let worker: Worker | null = null;
let ready = false;
let failed = false;
let requestSeq = 0;
const pending = new Map<
  number,
  { resolve: (vectors: number[][]) => void; reject: (error: Error) => void }
>();
const chunkVectors: ChunkVector[] = [];
const chunkVectorKeys = new Set<string>();

function chunkKey(chunk: ManualChunk): string {
  return `${chunk.heading} ${chunk.text}`;
}

/**
 * Settle every in-flight request as failed. A dead worker would otherwise
 * leave those promises pending forever, which hangs whatever awaited them
 * (a chat turn would never even appear).
 */
function rejectPending(error: Error): void {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

function handleMessage(event: MessageEvent): void {
  const data = event.data as
    | { type: "ready" }
    | { type: "vectors"; id: number; vectors: number[][] }
    | { type: "error"; id?: number; message: string };
  if (data.type === "ready") {
    ready = true;
    return;
  }
  if (data.type === "vectors") {
    const entry = pending.get(data.id);
    if (entry) {
      pending.delete(data.id);
      entry.resolve(data.vectors);
    }
    return;
  }
  if (data.type === "error") {
    if (data.id !== undefined) {
      const entry = pending.get(data.id);
      if (entry) {
        pending.delete(data.id);
        entry.reject(new Error(data.message));
      }
    } else {
      // Init failure: model files missing or runtime unsupported.
      failed = true;
      ready = false;
      rejectPending(new Error(data.message));
    }
  }
}

function ensureWorker(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./vectorWorker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", () => {
      failed = true;
      ready = false;
      rejectPending(new Error("vector worker crashed"));
    });
    worker.postMessage({ type: "init" });
  } catch {
    worker = null;
    failed = true;
  }
  return worker;
}

/** Kick model loading early (e.g. when the assistant sidebar opens). */
export function warmUpVectorIndex(): void {
  ensureWorker();
}

export function isVectorReady(): boolean {
  return ready && !failed;
}

function embed(
  texts: string[],
  isQuery: boolean,
  timeoutMs: number,
): Promise<number[][]> {
  const active = ensureWorker();
  if (!active) return Promise.reject(new Error("vector worker unavailable"));
  return new Promise((resolve, reject) => {
    const id = ++requestSeq;
    const timer = setTimeout(() => {
      // Drop the entry so a late reply from the worker is ignored instead of
      // resolving a promise nobody waits for any more.
      if (!pending.delete(id)) return;
      reject(new Error("vector embedding timed out"));
    }, timeoutMs);
    pending.set(id, {
      resolve: (vectors) => {
        clearTimeout(timer);
        resolve(vectors);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    active.postMessage({ type: "embed", id, texts, isQuery });
  });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot; // vectors are normalized at extraction time
}

/**
 * Drop cached vectors whose chunk no longer exists in the index. Without this
 * the cache grows for the lifetime of the window: every note edit produces new
 * chunk keys (`heading + text`) and the old ones are never looked up again.
 */
function pruneChunkVectors(valid: Map<string, ManualChunk>): void {
  if (chunkVectors.length === 0) return;
  const kept = chunkVectors.filter((entry) => valid.has(entry.key));
  if (kept.length === chunkVectors.length) return;
  chunkVectors.length = 0;
  chunkVectorKeys.clear();
  for (const entry of kept) {
    chunkVectors.push(entry);
    chunkVectorKeys.add(entry.key);
  }
}

/**
 * Fuse BM25 hits with semantic hits (RRF) and return the best `maxHits`.
 * `bm25Hits` must come from the same index snapshot as `allChunks`.
 */
export async function fuseHits(
  query: string,
  bm25Hits: ManualHit[],
  allChunks: ManualChunk[],
  maxHits: number,
): Promise<ManualHit[]> {
  const byKey = new Map(allChunks.map((chunk) => [chunkKey(chunk), chunk]));
  pruneChunkVectors(byKey);

  // Fill missing chunk embeddings incrementally (batched, deduplicated).
  const missing = allChunks.filter((chunk) => !chunkVectorKeys.has(chunkKey(chunk)));
  for (let start = 0; start < missing.length; start += CHUNK_BATCH) {
    const batch = missing.slice(start, start + CHUNK_BATCH);
    let vectors: number[][];
    try {
      vectors = await embed(
        batch.map((chunk) => chunk.text),
        false,
        CHUNK_BATCH_TIMEOUT_MS,
      );
    } catch (error) {
      // A partial cache is still useful: RRF sees fewer semantic candidates
      // this turn and the remaining chunks are retried on the next query.
      console.warn("ai: chunk embedding failed", error);
      break;
    }
    batch.forEach((chunk, i) => {
      const key = chunkKey(chunk);
      if (!chunkVectorKeys.has(key) && vectors[i]) {
        chunkVectorKeys.add(key);
        chunkVectors.push({ key, vector: vectors[i] });
      }
    });
  }

  const [queryVector] = await embed([query], true, QUERY_EMBED_TIMEOUT_MS);
  const scored = chunkVectors
    .map((entry) => ({
      hit: byKey.get(entry.key),
      score: queryVector ? cosine(queryVector, entry.vector) : 0,
    }))
    .filter((row): row is { hit: ManualChunk; score: number } => Boolean(row.hit))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHits * 2);

  const vectorHits: ManualHit[] = scored.map((row) => ({
    chunk: row.hit,
    score: row.score,
  }));

  // RRF: sum 1/(k + rank) over both lists.
  const fused = new Map<string, { hit: ManualHit; score: number }>();
  const addList = (hits: ManualHit[]) => {
    hits.forEach((hit, rank) => {
      const key = chunkKey(hit.chunk);
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = fused.get(key);
      if (existing) existing.score += contribution;
      else fused.set(key, { hit, score: contribution });
    });
  };
  addList(bm25Hits);
  addList(vectorHits);

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHits)
    .map((entry) => entry.hit);
}
