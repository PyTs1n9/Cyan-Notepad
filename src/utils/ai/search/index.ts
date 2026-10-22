/**
 * Search provider registry. Adding a search vendor = one adapter file + one
 * line here. Default preset: 博查 (domestic direct connection, citation
 * fields ready); Tavily is the planned second slot.
 */
import { bochaSearchProvider } from "./bocha";
import type { SearchProvider } from "./types";

export type {
  SearchProvider,
  WebSearchRequest,
  WebSearchResult,
} from "./types";

const providers: SearchProvider[] = [bochaSearchProvider];

export function listSearchProviders(): SearchProvider[] {
  return providers.slice();
}

export function getSearchProvider(id: string): SearchProvider | undefined {
  return providers.find((p) => p.id === id);
}

export const DEFAULT_SEARCH_PROVIDER_ID = "bocha";

export { bochaSearchProvider };
