/**
 * Backward-compatible facade over the provider layer.
 *
 * The real seams live in `./chat` (ChatProvider registry, OpenAI-compatible
 * adapter, presets) and `./search` (SearchProvider registry). Existing
 * callers keep importing from here; new code should prefer
 * `getChatProvider(id)` / `getSearchProvider(id)` so multi-model routing
 * stays in one place.
 */
import { invoke } from "@tauri-apps/api/core";
import { deepseekProvider, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "./chat/deepseek";

export { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL };
export { deepseekProvider };

export type { ChatMessage, ChatProvider, ChatRequest, ChatRole } from "./chat/types";
export { AiError } from "./errors";
export type { AiErrorCode } from "./errors";

/** DeepSeek-preset chat call. Prefer `getChatProvider(id).stream(…)`. */
export async function streamChat(
  request: Parameters<typeof deepseekProvider.stream>[0],
): Promise<string> {
  return deepseekProvider.stream(request);
}

/** DeepSeek-preset key check. Prefer `getChatProvider(id).testKey(…)`. */
export async function testApiKey(
  apiKey: string,
  signal?: AbortSignal,
): Promise<void> {
  return deepseekProvider.testKey(apiKey, signal);
}

export async function encryptSecret(plain: string): Promise<string> {
  return invoke<string>("encrypt_secret", { plain });
}

export async function decryptSecret(cipher: string): Promise<string> {
  return invoke<string>("decrypt_secret", { encrypted: cipher });
}
