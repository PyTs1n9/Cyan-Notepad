/**
 * DeepSeek 官方实时搜索 (https://api.deepseek.com/v1/tools/search).
 *
 * Reuses the same Bearer key as the chat preset, so enabling 联网搜索 needs no
 * second credential. The response carries rerank_score/title/url/snippet/
 * summary/site_name/date/authority — everything the citation block needs.
 */
import { AiError } from "../errors";
import {
  createHttpError,
  httpFetch,
  normalizeThrown,
  readErrorDetail,
} from "../http";
import type { SearchProvider, WebSearchRequest, WebSearchResult } from "./types";

const DEEPSEEK_SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
const MAX_QUERY_LENGTH = 128;
const MIN_COUNT = 1;
const MAX_COUNT = 50;
/** Only used when the payload has no snippet: keeps a whole page out of the prompt. */
const CONTENT_FALLBACK_LENGTH = 400;

interface DeepSeekSearchItem {
  rerank_score?: number;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string;
  date?: string;
  authority?: number;
}

interface DeepSeekSearchResponse {
  results?: DeepSeekSearchItem[];
}

function toResult(item: DeepSeekSearchItem): WebSearchResult {
  const snippet = item.snippet?.trim()
    || item.summary?.trim()
    || item.content?.trim().slice(0, CONTENT_FALLBACK_LENGTH)
    || "";
  return {
    title: item.title ?? "",
    url: item.url ?? "",
    snippet,
    ...(item.site_name ? { siteName: item.site_name } : {}),
    ...(item.date ? { publishedAt: item.date } : {}),
    ...(item.summary ? { summary: item.summary } : {}),
    ...(typeof item.authority === "number" ? { authority: item.authority } : {}),
  };
}

export const deepSeekSearchProvider: SearchProvider = {
  id: "deepseek",
  label: "DeepSeek 实时搜索",

  async search(request: WebSearchRequest): Promise<WebSearchResult[]> {
    const { apiKey, query, count = 5, oriQuestion, signal } = request;
    if (!apiKey) throw new AiError("missing-key");
    const trimmed = query.trim();
    if (!trimmed) return [];

    const body: Record<string, unknown> = {
      query: trimmed.slice(0, MAX_QUERY_LENGTH),
      count: Math.min(Math.max(count, MIN_COUNT), MAX_COUNT),
      // Snippets are enough for citations; full page bodies would blow up the prompt.
      need_content: false,
    };
    if (oriQuestion?.trim()) body.ori_question = oriQuestion.trim();

    let response: Response;
    try {
      response = await httpFetch(DEEPSEEK_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw normalizeThrown(error);
    }

    if (!response.ok) {
      throw createHttpError(response.status, await readErrorDetail(response));
    }

    const payload = (await response.json()) as DeepSeekSearchResponse;
    return (payload.results ?? []).map(toResult);
  },

  async testKey(apiKey: string, signal?: AbortSignal): Promise<void> {
    if (!apiKey) throw new AiError("missing-key");
    let response: Response;
    try {
      response = await httpFetch(DEEPSEEK_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: "ping", count: 1, need_content: false }),
        signal,
      });
    } catch (error) {
      throw normalizeThrown(error);
    }
    if (!response.ok) {
      throw createHttpError(response.status, await readErrorDetail(response));
    }
  },
};
