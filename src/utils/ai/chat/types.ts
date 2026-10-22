/**
 * The chat provider seam. Every generative model the app can talk to —
 * cloud API or a local inference service — is exposed as a `ChatProvider`.
 *
 * Two adapter families are planned (see docs/decisions-ai-integration.md #11):
 *  - `openai-compat`: one generic adapter covers DeepSeek/Kimi/GLM/通义/Ollama…
 *  - `custom`: one small adapter per non-compatible vendor (Claude, Gemini…)
 * Both plug into the same interface, so adding a vendor never touches callers.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A tool invocation requested by the model (function calling). */
export interface ChatToolCall {
  /** Wire-level call id, echoed back on the answering `tool` message. */
  id: string;
  name: string;
  /** Raw JSON-encoded arguments exactly as the model emitted them. */
  arguments: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Tool calls made in this assistant turn (replayed in history). */
  toolCalls?: ChatToolCall[];
  /** For role "tool": id of the call this message answers. */
  toolCallId?: string;
}

/** A function-calling tool definition (JSON Schema parameters). */
export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  /** User-supplied key (BYOK). Empty/absent only for keyless local services. */
  apiKey: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Called for every streamed text delta. Omit to receive the full text at once. */
  onDelta?: (delta: string) => void;
  /** Called for every streamed reasoning delta (thinking models). */
  onReasoning?: (delta: string) => void;
  /** Tool definitions offered to the model; requires `supportsTools`. */
  tools?: ChatTool[];
  /** Called once per turn with the tool calls the model requested. */
  onToolCalls?: (calls: ChatToolCall[]) => void;
}

export interface ChatProvider {
  /** Stable id used in persisted settings, e.g. "deepseek". */
  readonly id: string;
  /** Display name for the model dropdown. */
  readonly label: string;
  /** Adapter family this provider is implemented with. */
  readonly kind: "openai-compat" | "custom";
  /** Default model id sent to the API. */
  readonly model: string;
  /** Whether the backend can emit a reasoning stream (thinking models). */
  readonly supportsReasoning: boolean;
  /** Whether the backend supports function calling (`tools` / `tool_calls`). */
  readonly supportsTools: boolean;
  /** Run a chat completion and return the full assistant text. */
  stream(request: ChatRequest): Promise<string>;
  /** Minimal round trip to prove the key works (HTTP 200 suffices). */
  testKey(apiKey: string, signal?: AbortSignal): Promise<void>;
}
