/**
 * Retrieval engine over a plain-text manual. Pure logic, no imports — kept
 * separate from `manualRetrieval.ts` so it can be exercised directly under
 * `node --experimental-strip-types` without Vite's `?raw` loader.
 *
 * - Zero dependencies, fully offline, deterministic.
 * - CJK text is indexed as character bigrams (works without a segmenter);
 *   ASCII runs are indexed as lowercase words.
 * - A manual of a few dozen paragraphs indexes in single-digit milliseconds.
 *
 * The interface (ranked hits with heading paths) mirrors what an
 * embedding-based retriever would expose, so a semantic implementation can be
 * swapped in later without touching callers.
 */

export interface ManualChunk {
  id: number;
  /** Heading path like "记事：Markdown 编辑 > 三种视图". */
  heading: string;
  /** Cleaned plain text used for indexing and display. */
  text: string;
  /**
   * Offsets into `text` where the source manual had a line break.
   *
   * `text` is `lines.join(" ")`, which is right for BM25 (a bullet is still a
   * bullet's words) but wrong for anything that needs to know where one line
   * ended: `- **主题**：…` directly after `活动栏底部点「设置」：` reads as one
   * endless sentence. The answer composer needs that boundary, so it travels
   * with the chunk as a few small integers instead of a duplicated copy of the
   * text. Absent on chunks that came from a single-line block.
   */
  lineBreaks?: number[];
}

export interface ManualHit {
  chunk: ManualChunk;
  /** Relative relevance score, only meaningful within one query. */
  score: number;
}

const HEADING_WEIGHT = 3;
const DEFAULT_MAX_HITS = 5;
const MIN_SCORE = 1.0;
/** BM25 saturation / length-normalization constants. */
const K1 = 1.2;
const B = 0.75;

/** Pull Markdown syntax out of a line so it does not pollute the index. */
function cleanLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1 $2")
    .trim();
}

interface ParsedChunk {
  headings: string[];
  lines: string[];
}

/** Split the manual into chunks at `##`/`###` boundaries, tracking heading paths. */
function parseManual(raw: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const stack: string[] = [];
  let current: ParsedChunk | null = null;

  const push = () => {
    if (current && current.lines.some((line) => line.length > 0)) {
      chunks.push(current);
    }
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(rawLine);
    if (headingMatch) {
      const level = headingMatch[1].length;
      // The document title (single #) is context, not a chunk boundary.
      if (level >= 2) {
        push();
        // `##` sits at stack[0], `###` under it at stack[1], etc.
        stack.length = level - 1;
        stack[level - 2] = headingMatch[2].trim();
        current = { headings: [...stack], lines: [] };
        continue;
      }
    }
    if (!current) {
      current = { headings: [], lines: [] };
    }
    const cleaned = cleanLine(rawLine);
    if (cleaned) current.lines.push(cleaned);
  }
  push();
  return chunks;
}

/** CJK character bigrams + lowercase ASCII words + standalone CJK chars. */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  const cjkRuns = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i += 1) {
      terms.push(run.slice(i, i + 2));
    }
  }
  const asciiWords = text.toLowerCase().match(/[a-z0-9][a-z0-9+.-]*/g) ?? [];
  terms.push(...asciiWords);
  const singles = text.match(/[\u4e00-\u9fff\u3400-\u4dbf](?![\u4e00-\u9fff\u3400-\u4dbf])/g) ?? [];
  terms.push(...singles);
  return terms;
}

interface ChunkTokenEntry {
  chunk: ManualChunk;
  /** Term frequency map: term -> count (heading terms pre-weighted). */
  tf: Map<string, number>;
  length: number;
}

export interface ManualIndex {
  chunks: ManualChunk[];
  search: (query: string, maxHits?: number) => ManualHit[];
}

/** Build a searchable index from raw manual Markdown. */
export function createManualIndex(raw: string): ManualIndex {
  const parsed = parseManual(raw);
  const chunks: ManualChunk[] = [];
  const entries: ChunkTokenEntry[] = [];
  const documentFrequency = new Map<string, number>();

  parsed.forEach((piece, id) => {
    const heading = piece.headings.join(" > ");
    const bodyText = piece.lines.join(" ");

    const tf = new Map<string, number>();
    const bump = (term: string, weight: number) => {
      tf.set(term, (tf.get(term) ?? 0) + weight);
    };

    for (const term of tokenize(bodyText)) bump(term, 1);
    if (heading) {
      for (const term of tokenize(heading)) bump(term, HEADING_WEIGHT - 1);
    }

    const length = [...tf.values()].reduce((sum, count) => sum + count, 0);
    if (length === 0) return;

    const chunk: ManualChunk = { id, heading, text: bodyText };
    if (piece.lines.length > 1) {
      // Where each line ends inside `text`: every line is followed by the single
      // joining space, so the offsets are cumulative lengths plus those spaces.
      const breaks: number[] = [];
      let offset = 0;
      for (let i = 0; i < piece.lines.length - 1; i += 1) {
        offset += piece.lines[i].length + 1;
        breaks.push(offset);
      }
      chunk.lineBreaks = breaks;
    }
    chunks.push(chunk);
    entries.push({ chunk, tf, length });
    for (const term of tf.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  });

  const idf = new Map<string, number>();
  const total = Math.max(entries.length, 1);
  for (const [term, df] of documentFrequency) {
    // Smoothed inverse document frequency; every term keeps a positive floor.
    idf.set(term, Math.log(1 + (total - df + 0.5) / (df + 0.5)));
  }
  const avgLength =
    entries.reduce((sum, entry) => sum + entry.length, 0) /
    Math.max(entries.length, 1);

  const search = (query: string, maxHits = DEFAULT_MAX_HITS): ManualHit[] => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const queryTerms = tokenize(trimmed);
    if (queryTerms.length === 0) return [];

    const queryTf = new Map<string, number>();
    for (const term of queryTerms) {
      queryTf.set(term, (queryTf.get(term) ?? 0) + 1);
    }

    const hits: ManualHit[] = [];
    for (const entry of entries) {
      let score = 0;
      const lengthNorm = K1 * (1 - B + (B * entry.length) / avgLength);
      for (const [term, queryCount] of queryTf) {
        const docCount = entry.tf.get(term);
        if (!docCount) continue;
        const weight = idf.get(term) ?? 0;
        if (weight <= 0) continue;
        const tfScore = (docCount * (K1 + 1)) / (docCount + lengthNorm);
        score += weight * tfScore * Math.min(queryCount, 3);
      }
      if (score >= MIN_SCORE) {
        hits.push({ chunk: entry.chunk, score });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, maxHits);
  };

  return { chunks, search };
}
