/**
 * Polish (rewrite) generation for a selected passage.
 *
 * Contract with the model: return ONLY the rewritten passage — no explanation,
 * no quotes, no preamble — so the result can be diffed against the selection
 * and written straight back into the editor.
 */

import { deepseekProvider } from "./chat/deepseek";
import type { ChatMessage, ChatProvider } from "./chat/types";

const SYSTEM_PROMPT_ZH =
  "你是文字润色助手。请按用户要求改写给出的段落。只返回改写后的段落纯文本：" +
  "不加解释、不加引号、不加任何前后缀，保持原有 Markdown 行内格式（如 **加粗**、`代码`、列表符号）与段落结构不变。";

const SYSTEM_PROMPT_EN =
  "You are a text rewriting assistant. Rewrite the passage as requested. " +
  "Return ONLY the rewritten passage as plain text: no explanation, no quotes, " +
  "no preamble, and preserve the original Markdown inline formatting " +
  "(**bold**, `code`, list markers) and paragraph structure.";

const INSTRUCTION_DEFAULT_ZH = "润色这段文字，保持原意和语气。";
const INSTRUCTION_DEFAULT_EN = "Polish this passage, keeping its meaning and tone.";

export interface PolishRequestParams {
  apiKey: string;
  originalText: string;
  /** Free-form user instruction; falls back to a generic polish request. */
  instruction: string;
  lang: "zh" | "en";
  /** Generative provider to rewrite with; defaults to the DeepSeek preset. */
  provider?: ChatProvider;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export function buildPolishMessages(
  originalText: string,
  instruction: string,
  lang: "zh" | "en",
): ChatMessage[] {
  const system = lang === "zh" ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
  const requirement = instruction.trim() || (lang === "zh" ? INSTRUCTION_DEFAULT_ZH : INSTRUCTION_DEFAULT_EN);
  return [
    { role: "system", content: system },
    {
      role: "user",
      content:
        lang === "zh"
          ? `改写要求：${requirement}\n\n原文：\n${originalText}`
          : `Request: ${requirement}\n\nOriginal passage:\n${originalText}`,
    },
  ];
}

/** Stream a rewrite of `originalText`; returns the full rewritten text. */
export async function generatePolish(params: PolishRequestParams): Promise<string> {
  const {
    apiKey,
    originalText,
    instruction,
    lang,
    provider = deepseekProvider,
    signal,
    onDelta,
  } = params;
  return provider.stream({
    apiKey,
    messages: buildPolishMessages(originalText, instruction, lang),
    temperature: 0.3,
    // Reasoning counts against max_tokens before the rewrite appears.
    maxTokens: 4096,
    signal,
    onDelta,
  });
}
