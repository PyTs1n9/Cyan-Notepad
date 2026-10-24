/**
 * JSON Output (`response_format: json_object`) for side products that should be
 * structured rather than prose.
 *
 * Used only where a parse failure is harmless. The vendor documents that JSON
 * Output can occasionally return empty content, and an empty body makes the
 * adapter raise `bad-response`; so every call here has a plain-text fallback and
 * a shape check — a malformed card degrades to a one-field card, never an error
 * the user has to deal with.
 *
 * Deliberately NOT used for note writes: a silently empty body there would mean
 * "nothing happened" with no visible reason.
 */
import type { ChatMessage, ChatProvider, ThinkingLevel } from "./chat/types";
import { AiError } from "./errors";

export interface SummaryCard {
  title: string;
  summary: string;
  /** Bullet points; empty when the model produced prose only. */
  points: string[];
  tags: string[];
}

/** Cards are short by nature; this only guards against a runaway chain. */
const CARD_MAX_TOKENS = 1200;
const CARD_TEXT_LIMIT = 12000;

const JSON_SYSTEM_ZH = `你是笔记摘要助手。请把用户给出的内容浓缩成一张摘要卡，并输出 json 对象，字段如下：
{"title": "不超过 12 字的标题", "summary": "2-4 句的摘要", "points": ["要点一", "要点二"], "tags": ["标签一"]}
要求：只输出 json 本身，不要代码围栏，不要任何解释；points 最多 5 条，tags 最多 4 个且每个不超过 6 字。
示例输出：
{"title":"季度复盘","summary":"本季度完成了三次版本发布，主要问题集中在回归测试覆盖不足。","points":["发布节奏稳定","回归覆盖不足"],"tags":["复盘","发布"]}`;

const JSON_SYSTEM_EN = `You are a note summarizer. Condense the user's content into a summary card and return a json object:
{"title": "title, max 12 words", "summary": "2-4 sentences", "points": ["point one", "point two"], "tags": ["tag-one"]}
Rules: output json only, no code fences, no explanation; at most 5 points and 4 tags (each tag <= 3 words).
Example output:
{"title":"Q3 retro","summary":"Three releases shipped this quarter; the recurring problem was thin regression coverage.","points":["Steady release cadence","Thin regression coverage"],"tags":["retro","release"]}`;

const TEXT_SYSTEM_ZH =
  "你是笔记摘要助手。用 2-4 句话概括给出的内容，只输出摘要正文，不加标题、不加解释与引号。";
const TEXT_SYSTEM_EN =
  "You are a note summarizer. Summarize the content in 2-4 sentences. Output the summary only — no title, no explanation, no quotes.";

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Coerce whatever parsed out of the body into a card, or null when unusable. */
function toCard(value: unknown): SummaryCard | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) return null;
  return {
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    summary,
    points: asStringArray(raw.points, 5),
    tags: asStringArray(raw.tags, 4),
  };
}

function parseJsonBody(text: string): unknown {
  const trimmed = text.trim();
  // Defensive: models sometimes wrap the object in a fenced block despite the
  // instruction, and JSON.parse would then fail on the very first character.
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim()
    : trimmed;
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

export interface SummaryParams {
  apiKey: string;
  provider: ChatProvider;
  text: string;
  lang: "zh" | "en";
  thinkingLevel?: ThinkingLevel;
  /** Concrete model to call; omit to use the provider's default entry. */
  model?: string;
  signal?: AbortSignal;
}

/**
 * Only an empty body is worth retrying: the vendor documents that JSON Output
 * can return empty content, which the adapter reports as `bad-response`.
 * Auth, balance, rate-limit and network failures would just fail again.
 */
function isRecoverable(error: unknown): boolean {
  return error instanceof AiError && error.code === "bad-response";
}

/**
 * Produce a summary card.
 *
 * First attempt asks for JSON; if the model returns an empty body (a documented
 * JSON-mode failure) or an object without a `summary`, a second plain-text call
 * fills the card with prose and leaves `points`/`tags` empty.
 */
export async function generateSummaryCard(params: SummaryParams): Promise<SummaryCard> {
  const { apiKey, provider, text, lang, thinkingLevel = "low", model, signal } = params;
  // The selected model decides whether reasoning fields are sent at all.
  const target = provider.resolveTarget(thinkingLevel, model);
  const body = text.slice(0, CARD_TEXT_LIMIT);

  const jsonMessages: ChatMessage[] = [
    { role: "system", content: lang === "zh" ? JSON_SYSTEM_ZH : JSON_SYSTEM_EN },
    { role: "user", content: body },
  ];

  try {
    const raw = await provider.stream({
      apiKey,
      model: target.model,
      messages: jsonMessages,
      temperature: 0.2,
      maxTokens: CARD_MAX_TOKENS,
      signal,
      responseFormat: "json",
      thinking: target.thinking,
      reasoningEffort: target.reasoningEffort,
    });
    const card = toCard(parseJsonBody(raw));
    if (card) return card;
  } catch (error) {
    if (!isRecoverable(error)) throw error;
    if (signal?.aborted) throw error;
  }

  // Fallback: same content, no JSON contract, prose only.
  const plain = await provider.stream({
    apiKey,
    model: target.model,
    messages: [
      { role: "system", content: lang === "zh" ? TEXT_SYSTEM_ZH : TEXT_SYSTEM_EN },
      { role: "user", content: body },
    ],
    temperature: 0.3,
    maxTokens: CARD_MAX_TOKENS,
    signal,
    thinking: target.thinking,
    reasoningEffort: target.reasoningEffort,
  });
  return { title: "", summary: plain.trim(), points: [], tags: [] };
}
