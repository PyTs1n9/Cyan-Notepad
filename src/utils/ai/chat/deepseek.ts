/**
 * DeepSeek preset — the first `ChatProvider` implementation.
 * Users bring their own key (BYOK); the app never proxies or resells tokens.
 */
import { createOpenAiCompatProvider } from "./openaiCompat";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-flash";

export const deepseekProvider = createOpenAiCompatProvider({
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: DEEPSEEK_BASE_URL,
  model: DEEPSEEK_MODEL,
  supportsReasoning: true,
  // Verified on the official docs (2026-10-22): deepseek-flash supports
  // Tool Calls, incl. thinking mode.
  supportsTools: true,
});
