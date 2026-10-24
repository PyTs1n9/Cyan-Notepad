/**
 * Backward-compatible facade over the provider layer.
 *
 * The real seam lives in `./chat`: a dynamic ChatProvider registry built from
 * the user's endpoints, all through the OpenAI-compatible adapter. Callers that
 * need a provider use `getChatProvider(id)`; this file only re-exports the
 * shared types plus the DPAPI helpers used by the store.
 *
 * The old DeepSeek preset exports (`DEEPSEEK_MODEL`, `deepseekProvider`) are
 * gone on purpose: the app ships no vendor preset, so anything that used to
 * read them must go through the configured endpoints instead.
 */
import { invoke } from "@tauri-apps/api/core";

export type { ChatMessage, ChatProvider, ChatRequest, ChatRole, ThinkingLevel } from "./chat/types";
export type { AiEndpoint, EndpointModel } from "./chat/endpoints";
export { AiError } from "./errors";
export type { AiErrorCode } from "./errors";

export async function encryptSecret(plain: string): Promise<string> {
  return invoke<string>("encrypt_secret", { plain });
}

export async function decryptSecret(cipher: string): Promise<string> {
  return invoke<string>("decrypt_secret", { encrypted: cipher });
}
