/**
 * Generic OpenAI-compatible chat adapter (`POST {baseUrl}/chat/completions`).
 * One implementation covers DeepSeek, Kimi, GLM, 通义, SiliconFlow, Ollama…
 * Create a preset by calling `createOpenAiCompatProvider` with the vendor's
 * base URL and model id — see `deepseek.ts`.
 */
import { AiError } from "../errors";
import {
  createHttpError,
  httpFetch,
  normalizeThrown,
  readErrorDetail,
} from "../http";
import type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatTool,
  ChatToolCall,
} from "./types";

export interface OpenAiCompatConfig {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  supportsReasoning?: boolean;
  supportsTools?: boolean;
}

interface SseDelta {
  content: string | null;
  reasoning: string | null;
  toolCalls: SseToolCallFragment[] | null;
}

/** A streaming `delta.tool_calls[]` fragment; fields fill in across chunks. */
interface SseToolCallFragment {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * Map our message shape onto the OpenAI wire format. Tool messages and
 * assistant turns carrying tool calls need wire-only fields
 * (`tool_call_id`, `tool_calls[].type`), so messages are translated rather
 * than passed through.
 */
function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId ?? "",
      content: message.content,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function toWireTools(tools: ChatTool[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseSseLine(line: string): SseDelta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: {
        delta?: {
          content?: string;
          reasoning_content?: string;
          reasoning?: string;
          tool_calls?: SseToolCallFragment[];
        };
      }[];
    };
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return null;
    return {
      content: delta.content ?? null,
      // DeepSeek uses `reasoning_content`; accept `reasoning` for other
      // OpenAI-compatible backends.
      reasoning: delta.reasoning_content ?? delta.reasoning ?? null,
      toolCalls: delta.tool_calls ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Accumulate streamed tool-call fragments by index. Each fragment may carry
 * only the id, only a name, or a slice of the JSON arguments; the whole call
 * is assembled once the stream ends.
 */
function mergeToolCallFragments(
  into: Map<number, ChatToolCall>,
  fragments: SseToolCallFragment[],
): void {
  for (const fragment of fragments) {
    const existing = into.get(fragment.index) ?? {
      id: "",
      name: "",
      arguments: "",
    };
    if (fragment.id) existing.id = fragment.id;
    if (fragment.function?.name) existing.name += fragment.function.name;
    if (fragment.function?.arguments) existing.arguments += fragment.function.arguments;
    into.set(fragment.index, existing);
  }
}

const EMPTY_COMPLETION_DETAIL =
  "empty completion — 输出可能被 max_tokens 或模型思考过程耗尽，请提高 max_tokens 后重试";

export function createOpenAiCompatProvider(
  config: OpenAiCompatConfig,
): ChatProvider {
  const { id, label, baseUrl, model, supportsReasoning, supportsTools } = config;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function stream(request: ChatRequest): Promise<string> {
    const {
      apiKey,
      messages,
      temperature = 0.3,
      maxTokens,
      signal,
      onDelta,
      onReasoning,
      tools,
      onToolCalls,
    } = request;
    if (!apiKey) throw new AiError("missing-key");

    const wireTools = tools?.length ? toWireTools(tools) : undefined;
    let response: Response;
    try {
      response = await httpFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map(toWireMessage),
          stream: Boolean(onDelta || onReasoning),
          ...(wireTools ? { tools: wireTools } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
        signal,
      });
    } catch (error) {
      throw normalizeThrown(error);
    }

    if (!response.ok) {
      throw createHttpError(response.status, await readErrorDetail(response));
    }

    if ((!onDelta && !onReasoning) || !response.body) {
      const payload = (await response.json()) as {
        choices?: {
          message?: {
            content?: string;
            tool_calls?: {
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
      };
      const message = payload.choices?.[0]?.message;
      const content = message?.content ?? "";
      const toolCalls: ChatToolCall[] = (message?.tool_calls ?? []).map(
        (call, index) => ({
          id: call.id ?? `call_${index}`,
          name: call.function?.name ?? "",
          arguments: call.function?.arguments ?? "",
        }),
      );
      if (!content && !toolCalls.length) {
        throw new AiError("bad-response", EMPTY_COMPLETION_DETAIL);
      }
      if (content) onDelta?.(content);
      if (toolCalls.length) onToolCalls?.(toolCalls);
      return content;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    const toolCallAcc = new Map<number, ChatToolCall>();

    const consume = (delta: SseDelta) => {
      if (delta.reasoning) onReasoning?.(delta.reasoning);
      if (delta.content) {
        full += delta.content;
        onDelta?.(delta.content);
      }
      if (delta.toolCalls) mergeToolCallFragments(toolCallAcc, delta.toolCalls);
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const delta = parseSseLine(line);
          if (delta) consume(delta);
        }
      }
      const tail = parseSseLine(buffer);
      if (tail) consume(tail);
    } catch (error) {
      throw normalizeThrown(error);
    } finally {
      reader.releaseLock();
    }

    const toolCalls = [...toolCallAcc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call);
    // A tool-only turn legitimately streams no content at all.
    if (!full && !toolCalls.length) {
      throw new AiError("bad-response", EMPTY_COMPLETION_DETAIL);
    }
    if (toolCalls.length) onToolCalls?.(toolCalls);
    return full;
  }

  /**
   * Minimal round trip to prove the key works. Deliberately does NOT reuse
   * `stream`: a tiny max_tokens can be consumed entirely by reasoning tokens,
   * leaving an empty content that would be misreported as a bad response.
   * HTTP 200 alone means the key authenticated, which is all we need.
   */
  async function testKey(apiKey: string, signal?: AbortSignal): Promise<void> {
    if (!apiKey) throw new AiError("missing-key");

    let response: Response;
    try {
      response = await httpFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 4,
          temperature: 0,
          stream: false,
        }),
        signal,
      });
    } catch (error) {
      throw normalizeThrown(error);
    }

    if (!response.ok) {
      throw createHttpError(response.status, await readErrorDetail(response));
    }
  }

  return {
    id,
    label,
    kind: "openai-compat",
    model,
    supportsReasoning: supportsReasoning ?? false,
    supportsTools: supportsTools ?? false,
    stream,
    testKey,
  };
}
