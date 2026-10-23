/**
 * Search provider registry. Adding a search vendor = one adapter file + one
 * line here. Default preset: DeepSeek 官方搜索, which reuses the chat key so
 * 联网搜索 never asks for a second credential.
 */
import { deepSeekSearchProvider } from "./deepseek";
import type { SearchProvider } from "./types";

export type {
  SearchProvider,
  WebSearchRequest,
  WebSearchResult,
} from "./types";

const providers: SearchProvider[] = [deepSeekSearchProvider];

export function listSearchProviders(): SearchProvider[] {
  return providers.slice();
}

export function getSearchProvider(id: string): SearchProvider | undefined {
  return providers.find((p) => p.id === id);
}

export const DEFAULT_SEARCH_PROVIDER_ID = "deepseek";

export { deepSeekSearchProvider };
