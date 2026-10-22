/**
 * The web search provider seam. Real-time search feeds the DeepSeek-mode
 * RAG context; the app ships one default preset (Bocha) and can add more
 * (e.g. Tavily) as sibling adapter files without touching callers.
 */

export interface WebSearchRequest {
  /** User-supplied key (BYOK), same contract as `ChatRequest.apiKey`. */
  apiKey: string;
  query: string;
  /** Max results to return; adapters clamp to their own bounds. */
  count?: number;
  signal?: AbortSignal;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Site display name, when the backend provides it. */
  siteName?: string;
  /** ISO timestamp of publication, when available. */
  publishedAt?: string;
  /** Longer abstract, when the backend provides one. */
  summary?: string;
}

export interface SearchProvider {
  /** Stable id used in persisted settings, e.g. "bocha". */
  readonly id: string;
  /** Display name for the settings page. */
  readonly label: string;
  search(request: WebSearchRequest): Promise<WebSearchResult[]>;
  /** Minimal round trip to prove the key works. */
  testKey(apiKey: string, signal?: AbortSignal): Promise<void>;
}
