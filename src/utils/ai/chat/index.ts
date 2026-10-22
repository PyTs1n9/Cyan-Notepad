/**
 * Chat provider registry. Adding a vendor = adding one preset file and one
 * line here; callers (aiStore, polish) only ever see `ChatProvider`.
 */
import { deepseekProvider } from "./deepseek";
import type { ChatProvider } from "./types";

export type { ChatMessage, ChatProvider, ChatRequest, ChatRole } from "./types";
export { AiError } from "../errors";
export type { AiErrorCode } from "../errors";

/**
 * Extension slots (see docs/decisions-ai-integration.md #11):
 *  - OpenAI-compatible vendors → `createOpenAiCompatProvider` preset file.
 *  - Non-compatible vendors (Claude/Gemini native…) → a custom adapter file
 *    implementing `ChatProvider`, registered the same way.
 */
const providers: ChatProvider[] = [deepseekProvider];

export function listChatProviders(): ChatProvider[] {
  return providers.slice();
}

/** Providers that can generate text (润色 selector lists these). */
export function listGenerativeProviders(): ChatProvider[] {
  return providers.slice();
}

export function getChatProvider(id: string): ChatProvider | undefined {
  return providers.find((p) => p.id === id);
}

export { deepseekProvider };
