/**
 * 博查 Web Search preset (https://open.bochaai.com/).
 * POST {base}/web-search with a Bearer key; returns title/url/snippet/
 * siteName/datePublished — exactly the fields the citation needs.
 * Users bring their own key (BYOK).
 */
import { AiError } from "../errors";
import {
  createHttpError,
  httpFetch,
  normalizeThrown,
  readErrorDetail,
} from "../http";
import type { SearchProvider, WebSearchRequest, WebSearchResult } from "./types";

const BOCHA_BASE_URL = "https://api.bochaai.com/v1";

interface BochaWebResponse {
  code?: number;
  msg?: string;
  /** Some deployments wrap the payload in `data`; others return it top-level. */
  data?: BochaSearchPayload;
  webPages?: BochaSearchPayload["webPages"];
  _type?: string;
}

interface BochaSearchPayload {
  webPages?: {
    value?: {
      name?: string;
      url?: string;
      snippet?: string;
      summary?: string;
      siteName?: string;
      datePublished?: string;
    }[];
  };
}

export const bochaSearchProvider: SearchProvider = {
  id: "bocha",
  label: "博查 Web Search",

  async search(request: WebSearchRequest): Promise<WebSearchResult[]> {
    const { apiKey, query, count = 5, signal } = request;
    if (!apiKey) throw new AiError("missing-key");
    if (!query.trim()) return [];

    let response: Response;
    try {
      response = await httpFetch(`${BOCHA_BASE_URL}/web-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          count: Math.min(Math.max(count, 1), 10),
          summary: true,
          freshness: "noLimit",
        }),
        signal,
      });
    } catch (error) {
      throw normalizeThrown(error);
    }

    if (!response.ok) {
      throw createHttpError(response.status, await readErrorDetail(response));
    }

    const payload = (await response.json()) as BochaWebResponse;
    const value = payload.data?.webPages?.value ?? payload.webPages?.value ?? [];
    return value.map((item) => ({
      title: item.name ?? "",
      url: item.url ?? "",
      snippet: item.snippet ?? "",
      ...(item.summary ? { summary: item.summary } : {}),
      ...(item.siteName ? { siteName: item.siteName } : {}),
      ...(item.datePublished ? { publishedAt: item.datePublished } : {}),
    }));
  },

  async testKey(apiKey: string, signal?: AbortSignal): Promise<void> {
    if (!apiKey) throw new AiError("missing-key");
    let response: Response;
    try {
      response = await httpFetch(`${BOCHA_BASE_URL}/web-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query: "ping", count: 1, summary: false }),
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
