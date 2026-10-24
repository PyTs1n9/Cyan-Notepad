/**
 * Selection actions (AI 选区动作): the model is given the passage the user
 * selected plus one action, and returns text for that action only.
 *
 * Two output kinds, because they need different trust handling:
 *  - `replace` — the result is diffed against the selection and written back
 *    through the editor's own change path (never a blind overwrite; the editor
 *    refuses when the underlying text moved).
 *  - `card`    — the result is *about* the passage (a summary, a to-do list),
 *    so writing it over the selection would destroy the original. It is shown
 *    as a card with a copy button and never touches the document.
 *
 * Contract with the model for `replace` actions: return ONLY the rewritten text
 * — no explanation, no quotes, no preamble — so it can be applied verbatim.
 */

import type { ChatMessage, ChatProvider, ThinkingLevel } from "./chat/types";

export type SelectionActionId =
  | "polish"
  | "rewrite"
  | "continue"
  | "summarize"
  | "translate"
  | "checklist";

export interface SelectionAction {
  id: SelectionActionId;
  output: "replace" | "card";
  /** Whether the free-form instruction box applies to this action. */
  usesInstruction: boolean;
  /**
   * The model returns only the new text; the caller prepends the original so
   * the document ends up with both (`续写` must not eat what it continues).
   */
  append?: boolean;
  /** Output budget for this action. Cards are short; rewrites are not. */
  maxTokens: number;
}

export const SELECTION_ACTIONS: SelectionAction[] = [
  { id: "polish", output: "replace", usesInstruction: true, maxTokens: 4096 },
  { id: "rewrite", output: "replace", usesInstruction: true, maxTokens: 4096 },
  { id: "continue", output: "replace", usesInstruction: true, append: true, maxTokens: 2048 },
  { id: "summarize", output: "card", usesInstruction: false, maxTokens: 1536 },
  { id: "translate", output: "replace", usesInstruction: false, maxTokens: 4096 },
  { id: "checklist", output: "card", usesInstruction: false, maxTokens: 2048 },
];

export function getSelectionAction(id: SelectionActionId): SelectionAction {
  return SELECTION_ACTIONS.find((action) => action.id === id) ?? SELECTION_ACTIONS[0];
}

const SYSTEM_ZH: Record<SelectionActionId, string> = {
  polish:
    "你是文字润色助手。请按用户要求改写给出的段落。只返回改写后的段落纯文本：" +
    "不加解释、不加引号、不加任何前后缀，保持原有 Markdown 行内格式（如 **加粗**、`代码`、列表符号）与段落结构不变。",
  rewrite:
    "你是文字改写助手。请按用户要求重写给出的段落，可以调整结构与措辞，但必须保留原意与关键事实。" +
    "只返回改写后的纯文本：不加解释、不加引号、不加任何前后缀，保持 Markdown 行内格式。",
  continue:
    "你是写作助手。请紧接给出的文字末尾继续往下写，保持相同的语气、人称与 Markdown 风格。" +
    "只返回新增的续写内容本身：不要重复原文，不要加解释、引号或任何前后缀。",
  summarize: "你是笔记摘要助手。请把给出的内容浓缩成摘要。",
  translate:
    "你是翻译助手。把给出的段落译成英文；若原文已是英文，则译成中文。" +
    "只返回译文纯文本：不加解释、不加引号，保持 Markdown 行内格式与段落结构。",
  checklist:
    "你是任务拆解助手。把给出的内容整理成可执行的待办清单：每行一条，以「- [ ] 」开头，" +
    "条目以动词开头、单句、可独立执行，不要合并不同的事项。只输出清单本身。",
};

const SYSTEM_EN: Record<SelectionActionId, string> = {
  polish:
    "You are a text rewriting assistant. Rewrite the passage as requested. " +
    "Return ONLY the rewritten passage as plain text: no explanation, no quotes, " +
    "no preamble, and preserve the original Markdown inline formatting " +
    "(**bold**, `code`, list markers) and paragraph structure.",
  rewrite:
    "You are a text rewriting assistant. Rewrite the passage as requested; you may " +
    "restructure and rephrase, but keep the meaning and every key fact. Return ONLY " +
    "the rewritten text: no explanation, no quotes, no preamble, Markdown inline " +
    "formatting preserved.",
  continue:
    "You are a writing assistant. Continue directly from the end of the passage, " +
    "matching its tone, point of view and Markdown style. Return ONLY the new " +
    "continuation: do not repeat the original, add no explanation or quotes.",
  summarize: "You are a note summarizer. Condense the given content into a summary.",
  translate:
    "You are a translation assistant. Translate the passage into Chinese; if it is " +
    "already Chinese, translate it into English. Return ONLY the translation: no " +
    "explanation, no quotes, Markdown inline formatting preserved.",
  checklist:
    "You are a task breakdown assistant. Turn the content into an actionable to-do " +
    'list: one item per line, each prefixed with "- [ ] ", starting with a verb, ' +
    "one sentence each, independently actionable. Never merge distinct tasks. " +
    "Output the list only.",
};

const DEFAULT_INSTRUCTION_ZH: Partial<Record<SelectionActionId, string>> = {
  polish: "润色这段文字，保持原意和语气。",
  rewrite: "重写这段文字，让它更清楚有条理。",
  continue: "接着往下写一段。",
};

const DEFAULT_INSTRUCTION_EN: Partial<Record<SelectionActionId, string>> = {
  polish: "Polish this passage, keeping its meaning and tone.",
  rewrite: "Rewrite this passage so it reads more clearly.",
  continue: "Continue writing from here.",
};

/** The instruction actually sent: user-provided, else the action's default. */
export function resolveInstruction(
  action: SelectionActionId,
  instruction: string,
  lang: "zh" | "en",
): string {
  const trimmed = instruction.trim();
  if (trimmed) return trimmed;
  const defaults = lang === "zh" ? DEFAULT_INSTRUCTION_ZH : DEFAULT_INSTRUCTION_EN;
  return defaults[action] ?? "";
}

export function buildSelectionActionMessages(
  action: SelectionActionId,
  originalText: string,
  instruction: string,
  lang: "zh" | "en",
): ChatMessage[] {
  const system = lang === "zh" ? SYSTEM_ZH[action] : SYSTEM_EN[action];
  const requirement = resolveInstruction(action, instruction, lang);
  const bodyAction = action === "summarize" || action === "checklist";
  let user: string;
  if (lang === "zh") {
    user = bodyAction
      ? `内容：\n${originalText}`
      : `改写要求：${requirement}\n\n原文：\n${originalText}`;
  } else {
    user = bodyAction
      ? `Content:\n${originalText}`
      : `Request: ${requirement}\n\nOriginal passage:\n${originalText}`;
  }
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface SelectionActionParams {
  apiKey: string;
  action: SelectionActionId;
  originalText: string;
  /** Free-form user instruction; empty falls back to the action's default. */
  instruction: string;
  lang: "zh" | "en";
  /** Generative provider to run the action with. */
  provider: ChatProvider;
  /** Concrete model of that provider; omit to use its default entry. */
  model?: string;
  /** Persisted reasoning depth; the adapter drops it for non-thinking vendors. */
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
}

/**
 * Run one selection action and return the raw model text.
 *
 * For `append` actions this is only the continuation — composing it with the
 * original is the caller's job, so the panel can diff and apply the full text.
 */
export async function generateSelectionAction(
  params: SelectionActionParams,
): Promise<string> {
  const {
    apiKey,
    action,
    originalText,
    instruction,
    lang,
    provider,
    model,
    thinkingLevel = "low",
    signal,
    onDelta,
    onReasoning,
  } = params;
  const spec = getSelectionAction(action);
  const target = provider.resolveTarget(thinkingLevel, model);
  return provider.stream({
    apiKey,
    model: target.model,
    messages: buildSelectionActionMessages(action, originalText, instruction, lang),
    temperature: 0.3,
    maxTokens: spec.maxTokens,
    signal,
    thinking: target.thinking,
    reasoningEffort: target.reasoningEffort,
    onDelta,
    onReasoning,
  });
}
