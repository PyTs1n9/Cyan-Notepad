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
  /**
   * Chain-of-thought text for an assistant turn. DeepSeek requires it to be
   * sent back on every later request **when `tools` is present**, otherwise the
   * API answers 400; without `tools` it is ignored, so replaying it is always
   * safe. Populated only when thinking mode is on.
   */
  reasoning?: string;
  /** For role "tool": id of the call this message answers. */
  toolCallId?: string;
}

/** A function-calling tool definition (JSON Schema parameters). */
export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * User-facing reasoning depth, persisted as a preference. The store maps it to
 * the wire pair (`thinking` toggle + `reasoning_effort`) so the UI never has
 * to know the API's field names.
 *
 * `"off"` matters most: reasoning tokens are billed at the output rate and
 * share the same `max_tokens` budget as the reply, so a thinking turn can spend
 * the whole 4096 budget on CoT and return an empty body.
 */
export type ThinkingLevel = "off" | "low" | "high";

/**
 * Concrete call target for one reasoning level: which model id to send and how
 * to fill the reasoning wire fields. Resolved by the provider, so the UI never
 * has to know which vendor model corresponds to "high".
 *
 * `thinking` is **absent** for a model that does not accept reasoning fields.
 * That distinction matters on the wire: an OpenAI-compatible server that does
 * not know `thinking` may reject the whole request, so "no opinion" must stay
 * distinguishable from `disabled`.
 */
export interface ModelTarget {
  model: string;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: "low" | "high";
}

/**
 * One model an endpoint serves, plus whether it can think. The `/models`
 * payload carries no capability metadata, so this flag is a heuristic guess in
 * the settings row that the user can flip.
 */
export interface ProviderModel {
  id: string;
  supportsThinking: boolean;
}

export interface ChatRequest {
  /** User-supplied key (BYOK). Empty/absent only for keyless local services. */
  apiKey: string;
  /** Target model; omit to use the provider's default `model`. */
  model?: string;
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
  /**
   * Called once when the backend reports why the turn ended. `"length"` means
   * the answer was cut off by `maxTokens` (reasoning tokens count too), which
   * the UI must surface instead of presenting a truncated answer as complete.
   */
  onFinish?: (reason: string) => void;
  /** Reasoning toggle; dropped by adapters whose provider cannot do it. */
  thinking?: "enabled" | "disabled";
  /** Reasoning depth; only meaningful together with `thinking: "enabled"`. */
  reasoningEffort?: "low" | "high" | "max";
  /** Request a JSON object body instead of prose (vendor-dependent). */
  responseFormat?: "json";
}

export interface ChatProvider {
  /** Stable id used in persisted settings — the endpoint's uuid. */
  readonly id: string;
  /** Display name for the model list (the endpoint's label). */
  readonly label: string;
  /** Adapter family this provider is implemented with. */
  readonly kind: "openai-compat" | "custom";
  /** Default model id sent to the API when a request names none. */
  readonly model: string;
  /**
   * The models this provider can reach. Built from the endpoint config, so it
   * contains only the ones the user ticked — an unticked model must not be
   * selectable anywhere.
   */
  readonly models: ProviderModel[];
  /**
   * Whether the backend supports function calling (`tools` / `tool_calls`).
   * Note-write permission is **not** decided here: `noteWriteMode` is the only
   * gate (docs/decisions-ai-note-write.md). This flag only says whether the
   * endpoint can be expected to honour tools at all.
   */
  readonly supportsTools: boolean;
  /**
   * Map a reasoning level onto the model + wire fields to send, for a specific
   * model of this provider. Passing no model means "the default one".
   * This is the single place where "how hard should it think" becomes "which
   * model actually answers, and with which reasoning fields".
   */
  resolveTarget(level: ThinkingLevel, model?: string): ModelTarget;
  /** Run a chat completion and return the full assistant text. */
  stream(request: ChatRequest): Promise<string>;
  /** Minimal round trip to prove the key works (HTTP 200 suffices). */
  testKey(apiKey: string, signal?: AbortSignal): Promise<void>;
}
