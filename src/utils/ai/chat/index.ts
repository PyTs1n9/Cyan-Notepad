/**
 * Chat provider registry.
 *
 * There is no vendor preset any more: the list is *derived* from the endpoints
 * the user configured (设置 → AI 接口). `aiStore` owns that config and calls
 * `syncChatProviders()` after hydrate and after every mutation, so imperative
 * callers (the turn runner, 润色, 摘要卡) can keep resolving by id synchronously
 * while the React tree renders straight from the store.
 *
 * An endpoint with no enabled model produces a provider with an empty `models`
 * array: it exists (its settings row still needs it) but never shows up in the
 * picker.
 */
import { createOpenAiCompatProvider } from "./openaiCompat";
import type { AiEndpoint } from "./endpoints";
import type { ChatProvider } from "./types";

export type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatRole,
  ModelTarget,
  ProviderModel,
  ThinkingLevel,
} from "./types";
export { AiError } from "../errors";
export type { AiErrorCode } from "../errors";

let providers: ChatProvider[] = [];

/** Rebuild the registry from the persisted endpoint list. */
export function syncChatProviders(endpoints: AiEndpoint[]): void {
  providers = endpoints.map((endpoint) =>
    createOpenAiCompatProvider({
      id: endpoint.id,
      label: endpoint.name,
      baseUrl: endpoint.baseUrl,
      // Only enabled models are reachable: an unticked one must not be
      // answerable from the chat bar even if its id is still in a preference.
      models: endpoint.models
        .filter((model) => model.enabled)
        .map((model) => ({ id: model.id, supportsThinking: model.supportsThinking })),
      // Tool support is not a per-endpoint switch: `noteWriteMode` is the only
      // permission gate (docs/decisions-ai-note-write.md), so every endpoint is
      // assumed able to accept a `tools` array until it says otherwise.
      supportsTools: true,
    }),
  );
}

export function listChatProviders(): ChatProvider[] {
  return providers.filter((provider) => provider.models.length > 0);
}

/** Providers that can generate text (润色 selector lists these). */
export function listGenerativeProviders(): ChatProvider[] {
  return listChatProviders();
}

export function getChatProvider(id: string): ChatProvider | undefined {
  return providers.find((p) => p.id === id);
}

/**
 * Test seam: the registry is module state, so a unit test (or a headless
 * render) can reset it without going through the store.
 */
export function resetChatProviders(): void {
  providers = [];
}
