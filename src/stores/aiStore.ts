import { create } from "zustand";
import {
  deleteAiCredentialCipher,
  loadAiCredentialCipher,
  loadAiPreferences,
  saveAiCredentialCipher,
  saveAiPreferences,
  loadAiConversations,
  deleteAiConversation,
  saveAiConversation,
  type StoredAiChatMessage,
  type StoredAiPreferences,
} from "@/utils/storage";
import {
  AiError,
  decryptSecret,
  encryptSecret,
  type AiErrorCode,
  type ChatMessage,
  type ChatProvider,
} from "@/utils/ai/provider";
import { getChatProvider } from "@/utils/ai/chat";
import {
  getSearchProvider,
  DEFAULT_SEARCH_PROVIDER_ID,
  type WebSearchResult,
} from "@/utils/ai/search";
import { searchKnowledge, type ManualHit } from "@/utils/ai/knowledgeRetrieval";
import { composeLocalAnswerFromHit } from "@/utils/ai/answerComposer";
import {
  buildNoteDirectory,
  executeNoteTool,
  NOTE_WRITE_TOOLS,
  undoNoteEdit,
  type AiNoteEdit,
} from "@/utils/ai/noteWrite";
import type { ChatToolCall } from "@/utils/ai/chat/types";
import { withTimeout } from "@/utils/ai/http";
import { warmUpVectorIndex } from "@/utils/ai/vectorIndex";
import { useSettingsStore } from "@/stores/settingsStore";

/** Chat routing: "local" = 小青 knowledge-base mode, any other value = provider id. */
export const LOCAL_MODEL_ID = "local";
const DEFAULT_POLISH_MODEL_ID = "deepseek";
/** Deadline for the one-shot key checks in 设置 → AI 设置. */
const KEY_TEST_TIMEOUT_MS = 15_000;
/**
 * Output budget per turn. 2048 was routinely eaten by reasoning tokens on
 * thinking models, truncating the visible answer without any signal; 4096
 * leaves room for thinking plus a full reply. Truncation is still possible and
 * is now reported (`truncated`), never silent.
 */
const MAX_ANSWER_TOKENS = 4_096;

/** Coarse stage of a turn, shown while the answer text is still empty. */
export type AiTurnPhase = "retrieving" | "searching" | "thinking" | "writing";

/** One web result the answer was built from; rendered as a clickable source. */
export interface AiMessageSource {
  title: string;
  url: string;
  siteName?: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Thinking/reasoning stream from the model (thinking models only). */
  reasoning?: string;
  /** Manual chunks retrieved for this turn; rendered as source cards. */
  hits: ManualHit[];
  streaming?: boolean;
  /** Set when the turn failed; `content` may hold partial output. */
  errorCode?: AiErrorCode;
  /**
   * Set when 联网搜索 was on but the request failed. The turn still answers
   * from the local knowledge base; the flag only drives a hint, so the failure
   * is never silent.
   */
  searchError?: boolean;
  /** Note writes this turn performed (full-permission mode); undo targets. */
  edits?: AiNoteEdit[];
  /** Web results the turn was answered from (empty when search was off/failed). */
  sources?: AiMessageSource[];
  /** The turn hit `max_tokens`: the answer shown is cut off. */
  truncated?: boolean;
  /** Current stage of a streaming turn; cleared once text starts arriving. */
  phase?: AiTurnPhase;
  /** Creation time (ms since epoch), shown on hover in the sidebar. */
  createdAt: number;
}

/** Note-write permission mode for the chat assistant. */
export type NoteWriteMode = "readonly" | "full";

export interface AiConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredAiChatMessage[];
}

export interface PolishSession {
  id: string;
  noteId: string;
  /** The passage captured from the editor selection at entry time. */
  originalText: string;
  /**
   * Write the rewrite back through the editor's own change path. Returns
   * false when the underlying text changed since the selection was captured,
   * in which case nothing was written.
   */
  apply: (newText: string) => boolean;
  /** Reverse the last apply. */
  undo: () => void;
}

export type AiKeyStatus = "idle" | "loading" | "saving" | "testing";

let abortController: AbortController | null = null;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface AiState {
  /** Plain-text key held in memory only; never persisted as-is. */
  apiKey: string | null;
  hasKey: boolean;
  loaded: boolean;
  status: AiKeyStatus;
  sidebarOpen: boolean;
  lastErrorCode: AiErrorCode | null;
  lastErrorDetail: string | null;
  messages: AiChatMessage[];
  sending: boolean;
  polish: PolishSession | null;
  polishApplied: boolean;
  /** Selected chat model: `LOCAL_MODEL_ID` or a `ChatProvider` id. */
  chatModel: string;
  /** Selected 润色 model: a generative `ChatProvider` id. */
  polishModel: string;
  /** Whether DeepSeek-mode turns run a real-time web search. */
  searchEnabled: boolean;
  /** Saved conversations (snapshot copies; the live view is `messages`). */
  conversations: AiConversation[];
  /** Conversation the live `messages` belong to; null = unsaved fresh chat. */
  activeConversationId: string | null;
  /** Note-write permission: "readonly" (assistant only) or "full" (may edit). */
  noteWriteMode: NoteWriteMode;

  hydrate: () => Promise<void>;
  saveKey: (plain: string) => Promise<boolean>;
  clearKey: () => Promise<void>;
  verifyKey: (plain?: string) => Promise<boolean>;
  setSearchEnabled: (enabled: boolean) => void;
  setNoteWriteMode: (mode: NoteWriteMode) => void;
  /** Roll back the note writes recorded on an assistant message (reverse order). */
  undoMessageEdits: (messageId: string) => Promise<void>;
  recordError: (error: unknown) => void;
  clearError: () => void;
  setSidebarOpen: (open: boolean) => void;
  setChatModel: (modelId: string) => void;
  setPolishModel: (modelId: string) => void;
  sendMessage: (text: string) => Promise<void>;
  stopGenerating: () => void;
  clearChat: () => void;
  /** Start a fresh chat; the current one is saved (or dropped when empty). */
  newConversation: () => void;
  /** Switch to a saved conversation; the current one is saved first. */
  switchConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  /** Delete a message together with its paired counterpart (question + answer). */
  deleteMessage: (id: string) => void;
  /**
   * Re-ask the question that produced the given assistant message. The new
   * reply is appended right after the old one so both stay comparable.
   */
  regenerate: (assistantId: string) => Promise<void>;
  startPolish: (session: Omit<PolishSession, "id">) => void;
  setPolishApplied: (applied: boolean) => void;
  cancelPolish: () => void;
}

function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Error) return new AiError("network", error.message);
  return new AiError("network", String(error));
}

/** Persisted ids are validated against the provider registry on restore. */
function normalizeChatModel(value: unknown): string {
  if (typeof value === "string" && value !== LOCAL_MODEL_ID && getChatProvider(value)) {
    return value;
  }
  return LOCAL_MODEL_ID;
}

/** Snapshot of the AI preference bag; kept whole so partial sets never drop fields. */
function persistPreferences(state: AiState): Promise<void> {
  return saveAiPreferences({
    chatModel: state.chatModel,
    polishModel: state.polishModel,
    searchEnabled: state.searchEnabled,
    noteWriteMode: state.noteWriteMode,
  } satisfies StoredAiPreferences);
}

/** Persisted mode is validated; anything unknown falls back to read-only. */
function normalizeNoteWriteMode(value: unknown): NoteWriteMode {
  return value === "full" ? "full" : "readonly";
}

/**
 * 联网搜索 follows the recorded decision (docs/decisions-ai-integration.md #3:
 * 默认开启、可关闭), so an absent preference means enabled. It reuses the chat
 * key, so a configured chat key is all it needs.
 */
function normalizeSearchEnabled(value: unknown): boolean {
  return value === undefined || value === null ? true : Boolean(value);
}

function normalizePolishModel(value: unknown): string {
  if (typeof value === "string" && getChatProvider(value)) return value;
  return DEFAULT_POLISH_MODEL_ID;
}

/**
 * "小青" local answer: the best hit only, with its section heading as a
 * lead-in line. One question, one streamed answer — never a pile of excerpt
 * cards.
 *
 * The hit is assembled by `answerComposer`, which reshapes the same excerpt
 * according to what was asked (steps / location / verdict / definition) so two
 * different questions about one section no longer produce identical text.
 */
function composeLocalAnswer(hits: ManualHit[], question: string): string {
  return composeLocalAnswerFromHit(hits, question);
}

/** Retarget a streaming turn's stage label (retrieval → search → thinking → write). */
function setPhase(
  set: StoreSet,
  assistantId: string,
  phase: AiTurnPhase | undefined,
): void {
  set((state) => ({
    messages: state.messages.map((m) => (m.id === assistantId ? { ...m, phase } : m)),
  }));
}

/**
 * Reveal `text` in paced deltas so the local answer types out through the
 * same streaming pipeline as a model reply instead of snapping in. Honors
 * the shared abort signal so 停止 cuts it like a generation.
 */
const LOCAL_STREAM_MS_PER_CHAR = 8;
const LOCAL_STREAM_MIN_MS = 600;
const LOCAL_STREAM_MAX_MS = 2400;
const LOCAL_STREAM_TICK_MS = 24;

function pacedStreamText(
  text: string,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (!text || signal.aborted) {
      resolve();
      return;
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onDelta(text);
      resolve();
      return;
    }
    const duration = Math.min(
      Math.max(text.length * LOCAL_STREAM_MS_PER_CHAR, LOCAL_STREAM_MIN_MS),
      LOCAL_STREAM_MAX_MS,
    );
    const totalTicks = Math.max(1, Math.round(duration / LOCAL_STREAM_TICK_MS));
    let tick = 0;
    let offset = 0;
    const timer = setInterval(() => {
      if (signal.aborted) {
        clearInterval(timer);
        resolve();
        return;
      }
      tick += 1;
      const end = Math.min(
        text.length,
        Math.ceil((tick / totalTicks) * text.length),
      );
      if (end > offset) {
        onDelta(text.slice(offset, end));
        offset = end;
      }
      if (tick >= totalTicks || offset >= text.length) {
        clearInterval(timer);
        resolve();
      }
    }, LOCAL_STREAM_TICK_MS);
  });
}

const CONVERSATION_TITLE_MAX = 30;

/** One-line first-question title, truncated for the history list. */
function conversationTitleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > CONVERSATION_TITLE_MAX
    ? `${oneLine.slice(0, CONVERSATION_TITLE_MAX)}…`
    : oneLine;
}

/**
 * Upsert the active conversation from the live `messages` and persist it.
 * Streaming flags are stripped so a restored session never renders a stale
 * "streaming" bubble. Only this conversation's shard is written — the history
 * list is not rewritten on every turn.
 */
function syncConversations(set: StoreSet, get: StoreGet): void {
  const { conversations, activeConversationId, messages } = get();
  if (!activeConversationId) return;
  const snapshot = messages.map(
    (m) => ({ ...m, streaming: false, phase: undefined }) as unknown as StoredAiChatMessage,
  );
  const now = Date.now();
  const existing = conversations.find((c) => c.id === activeConversationId);
  const active: AiConversation = existing
    ? { ...existing, messages: snapshot, updatedAt: now }
    : {
        id: activeConversationId,
        title: "",
        createdAt: now,
        updatedAt: now,
        messages: snapshot,
      };
  const next = existing
    ? conversations.map((c) => (c.id === activeConversationId ? active : c))
    : [...conversations, active];
  set({ conversations: next });
  void saveAiConversation(active);
}

/** Persist-or-drop the current conversation when leaving it. */
function stashActiveConversation(set: StoreSet, get: StoreGet): void {
  const { activeConversationId, messages } = get();
  if (!activeConversationId) return;
  if (messages.length > 0) {
    syncConversations(set, get);
    return;
  }
  // Empty chat: dropped, never listed.
  const next = get().conversations.filter((c) => c.id !== activeConversationId);
  set({ conversations: next });
  void deleteAiConversation(activeConversationId);
}

type StoreSet = (
  partial: Partial<AiState> | ((state: AiState) => Partial<AiState>),
) => void;
type StoreGet = () => AiState;

/**
 * Run one assistant turn into the message `assistantId` (already appended as
 * a streaming placeholder). Shared by sendMessage and regenerate.
 *
 * History is everything *before* this turn's question (`questionIndex`): the
 * question is re-sent below together with the retrieved context, so keeping it
 * in the history slice would put the same text in the prompt twice — and on
 * regenerate it would also replay the answer being replaced.
 */
async function runGeneration(
  assistantId: string,
  question: string,
  hits: ManualHit[],
  questionIndex: number,
  controller: AbortController,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const all = get().messages;
  const placeholderIndex = all.findIndex((m) => m.id === assistantId);
  const cut = placeholderIndex >= 0 ? Math.min(questionIndex, placeholderIndex) : questionIndex;
  const history: ChatMessage[] = all
    .slice(0, Math.max(cut, 0))
    .filter(
      (m) =>
        !m.errorCode &&
        (m.role === "user" || (m.role === "assistant" && m.content.trim())),
    )
    .slice(-6)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const apiKey = get().apiKey;
  abortController = controller;

  // Route by the sidebar model picker. An unknown persisted id falls back
  // to 小青 so a stale preference can never dead-end the input box.
  const selected = get().chatModel;
  const provider: ChatProvider | null =
    selected === LOCAL_MODEL_ID ? null : (getChatProvider(selected) ?? null);

  // "小青" local mode. Stream the best retrieval hit as typed text
  // through the same message pipeline a model reply uses — no cards.
  if (!provider) {
    const answer = composeLocalAnswer(hits, question);
    try {
      await pacedStreamText(answer, controller.signal, (delta) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          ),
        })),
      );
    } finally {
      if (abortController === controller) abortController = null;
      set((state) => ({
        sending: false,
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, phase: undefined } : m,
        ),
      }));
      syncConversations(set, get);
    }
    return;
  }

  // API model selected but no key configured yet: fail the turn with the
  // missing-key code so the UI can point at 设置.
  if (!apiKey) {
    set((state) => ({
      sending: false,
      messages: state.messages.map((m) =>
        m.id === assistantId
          ? { ...m, streaming: false, errorCode: "missing-key" as AiErrorCode }
          : m,
      ),
    }));
    if (abortController === controller) abortController = null;
    return;
  }

  const lang = useSettingsStore.getState().lang;

  // Real-time web search (DeepSeek mode): best-effort — a failed or disabled
  // search degrades to knowledge-base RAG and never blocks the turn. The
  // failure is surfaced on the message (`searchError`) so an expired key or a
  // blocked host is visible instead of silently answering without sources.
  let webResults: WebSearchResult[] = [];
  let searchFailed = false;
  const { searchEnabled } = get();
  const searchProvider = getSearchProvider(DEFAULT_SEARCH_PROVIDER_ID);
  // The search adapter shares the already-validated chat key: 联网搜索 adds no
  // second credential, so its failure modes are the same as the chat call.
  if (searchEnabled && searchProvider) {
    setPhase(set, assistantId, "searching");
    try {
      webResults = await searchProvider.search({
        apiKey,
        query: question,
        oriQuestion: question,
        count: 5,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        webResults = [];
      } else {
        webResults = [];
        searchFailed = true;
        console.warn("ai: web search failed", error);
      }
    }
    if (controller.signal.aborted) {
      if (abortController === controller) abortController = null;
      set((state) => ({
        sending: false,
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, phase: undefined } : m,
        ),
      }));
      return;
    }
  }

  // Note-write permission: "full" hands the model editing tools (see
  // docs/decisions-ai-note-write.md); "readonly" keeps it answering only.
  const writeMode = get().noteWriteMode === "full" && provider.supportsTools;

  const systemContent =
    lang === "zh"
      ? "你是「小青」，桌面应用「青记」的内置助手。回答软件使用问题时优先依据【知识库】参考片段，不要编造界面中不存在的功能；片段未覆盖时如实说明。知识库片段包含用户笔记、待办与画布内容，可据此回答「我记过什么」这类问题。若提供了【网页】搜索结果，可回答一般性问题，并在使用了结果的句子末尾标注（来源：站点名）。回答用中文，简洁、分步骤。" +
        (writeMode
          ? `\n\n用户已开启「完全开放」笔记权限：你可以用工具直接读取并修改笔记正文与标题，修改立即生效、用户可撤销。修改前必须先用 read_note 读取原文，在原文基础上改动后用 update_note_content 输出完整正文，绝不丢失原有内容；用 rename_note 改标题。不要删除笔记，也不要新建笔记。\n\n【笔记目录】\n${buildNoteDirectory()}`
          : "\n\n你不能修改用户笔记。当用户要求修改时，说明需要在编辑器中手动改，并把建议的文本用代码块给出方便复制。")
      : "You are XiaoQing, the built-in assistant of the Qing Notepad desktop app. For usage questions, answer from the 【知识库】 excerpts (they include the user's notes, todos and canvas text) and never invent UI that does not exist. When 【网页】 web search results are provided you may answer general questions; end sentences that use a result with (Source: site name). Be concise and step-by-step." +
        (writeMode
          ? `\n\nThe user has granted full note permission: you may read and edit note bodies and titles through tools; edits take effect immediately and can be undone by the user. Always call read_note first and rewrite the complete body with update_note_content so nothing is lost; use rename_note for titles. Never delete or create notes.\n\n【Notes directory】\n${buildNoteDirectory()}`
          : "\n\nYou cannot modify the user's notes. When asked to edit one, say the change has to be made in the editor and give the suggested text in a code block for copying.");
  const system: ChatMessage = {
    role: "system",
    content: systemContent,
  };
  const kbBlock = hits
    .map((hit) => `【${hit.chunk.heading || "概述"}】\n${hit.chunk.text}`)
    .join("\n\n");
  const webBlock = webResults
    .map(
      (result, i) =>
        `【${i + 1}. ${result.title}】${result.siteName ? `（${result.siteName}）` : ""}\n${
          result.summary || result.snippet
        }\n${result.url}`,
    )
    .join("\n\n");
  const references = [
    kbBlock ? `知识库片段：\n${kbBlock}` : "",
    webBlock ? `网页搜索结果：\n${webBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const user: ChatMessage = {
    role: "user",
    content: references ? `${references}\n\n问题：${question}` : `问题：${question}`,
  };

  // Agent loop: at most MAX_TOOL_ROUNDS tool round trips, then the turn ends
  // whatever the model asks for — a runaway tool loop can never spin forever.
  const MAX_TOOL_ROUNDS = 3;
  const turnMessages: ChatMessage[] = [system, ...history, user];
  const tools = writeMode ? NOTE_WRITE_TOOLS : undefined;
  const edits: AiNoteEdit[] = [];
  let truncated = false;

  try {
    for (let round = 0; ; round++) {
      let turnCalls: ChatToolCall[] = [];
      setPhase(set, assistantId, "thinking");
      const turnText = await provider.stream({
        apiKey,
        messages: turnMessages,
        // The model streams reasoning before content; a tight cap lets thinking
        // eat the budget and leaves the answer empty.
        maxTokens: MAX_ANSWER_TOKENS,
        signal: controller.signal,
        tools,
        onFinish: (reason) => {
          if (reason === "length") truncated = true;
        },
        onToolCalls: (calls) => {
          turnCalls = calls;
        },
        onDelta: (delta) =>
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          })),
        onReasoning: (delta) =>
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantId
                ? { ...m, reasoning: (m.reasoning ?? "") + delta }
                : m,
            ),
          })),
      });
      if (!turnCalls.length || !tools || round >= MAX_TOOL_ROUNDS) break;
      turnMessages.push({ role: "assistant", content: turnText, toolCalls: turnCalls });
      setPhase(set, assistantId, "writing");
      for (const call of turnCalls) {
        if (controller.signal.aborted) break;
        const result = await executeNoteTool(call);
        if (result.edit) edits.push(result.edit);
        turnMessages.push({
          role: "tool",
          content: result.output,
          toolCallId: call.id,
        });
      }
      if (controller.signal.aborted) break;
    }
    const sources: AiMessageSource[] | undefined = webResults.length
      ? webResults
          .filter((result) => /^https?:\/\//i.test(result.url))
          .slice(0, 4)
          .map((result) => ({
            title: result.title || result.url,
            url: result.url,
            ...(result.siteName ? { siteName: result.siteName } : {}),
          }))
      : undefined;
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              streaming: false,
              phase: undefined,
              edits: edits.length ? edits : undefined,
              sources,
              truncated: truncated || undefined,
              searchError: searchFailed || undefined,
            }
          : m,
      ),
    }));
  } catch (error) {
    const aiError = toAiError(error);
    set((state) => ({
      lastErrorCode: aiError.code,
      lastErrorDetail: aiError.detail ?? null,
      messages: state.messages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              streaming: false,
              phase: undefined,
              errorCode: aiError.code,
              searchError: searchFailed || undefined,
            }
          : m,
      ),
    }));
  } finally {
    if (abortController === controller) abortController = null;
    set({ sending: false });
    syncConversations(set, get);
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  apiKey: null,
  hasKey: false,
  loaded: false,
  status: "idle",
  // Mirrors the left sidebar's default: the panel starts expanded. Only the
  // toggle hides it; a fresh launch always shows it again.
  sidebarOpen: true,
  lastErrorCode: null,
  lastErrorDetail: null,
  messages: [],
  sending: false,
  polish: null,
  polishApplied: false,
  chatModel: LOCAL_MODEL_ID,
  polishModel: DEFAULT_POLISH_MODEL_ID,
  searchEnabled: true,
  noteWriteMode: "readonly",
  conversations: [],
  activeConversationId: null,

  hydrate: async () => {
    if (get().loaded || get().status === "loading") return;
    set({ status: "loading" });
    // Start loading the embedding model in the background so the first
    // question already benefits from the semantic channel (progressive).
    warmUpVectorIndex();
    const [cipher, prefs, savedConversations] = await Promise.all([
      loadAiCredentialCipher(),
      loadAiPreferences(),
      loadAiConversations(),
    ]);
    // Re-open the most recently active conversation so a relaunch continues
    // where the user left off.
    const last = savedConversations.reduce<AiConversation | null>(
      (acc, c) => (!acc || c.updatedAt > acc.updatedAt ? c : acc),
      null,
    );
    const restoredConv = last
      ? {
          activeConversationId: last.id,
          messages: last.messages.map(
            (m) => ({ ...m, streaming: false }) as AiChatMessage,
          ),
        }
      : { activeConversationId: null, messages: [] as AiChatMessage[] };
    const restored = {
      chatModel: normalizeChatModel(prefs.chatModel),
      polishModel: normalizePolishModel(prefs.polishModel),
      searchEnabled: normalizeSearchEnabled(prefs.searchEnabled),
      noteWriteMode: normalizeNoteWriteMode(prefs.noteWriteMode),
      conversations: savedConversations,
      ...restoredConv,
    };
    if (!cipher) {
      set({
        apiKey: null,
        hasKey: false,
        loaded: true,
        status: "idle",
        ...restored,
      });
      return;
    }
    try {
      const plain = await decryptSecret(cipher);
      set({
        apiKey: plain,
        hasKey: true,
        loaded: true,
        status: "idle",
        ...restored,
      });
    } catch (error) {
      // A DPAPI blob can become unreadable after a user or machine change.
      // Drop it so the UI asks for the key again instead of failing silently.
      const aiError = toAiError(error);
      set({
        apiKey: null,
        hasKey: false,
        loaded: true,
        status: "idle",
        lastErrorCode: aiError.code,
        lastErrorDetail: aiError.detail ?? null,
        ...restored,
      });
    }
  },

  saveKey: async (plain) => {
    const trimmed = plain.trim();
    if (!trimmed) {
      set({ lastErrorCode: "missing-key", lastErrorDetail: null });
      return false;
    }
    set({ status: "saving" });
    try {
      const cipher = await encryptSecret(trimmed);
      await saveAiCredentialCipher(cipher);
      set({
        apiKey: trimmed,
        hasKey: true,
        loaded: true,
        status: "idle",
        lastErrorCode: null,
        lastErrorDetail: null,
      });
      return true;
    } catch (error) {
      const aiError = toAiError(error);
      set({
        status: "idle",
        lastErrorCode: aiError.code,
        lastErrorDetail: aiError.detail ?? null,
      });
      return false;
    }
  },

  clearKey: async () => {
    await deleteAiCredentialCipher();
    set({
      apiKey: null,
      hasKey: false,
      loaded: true,
      lastErrorCode: null,
      lastErrorDetail: null,
    });
  },

  verifyKey: async (plain) => {
    const key = plain?.trim() || get().apiKey;
    if (!key) {
      set({ lastErrorCode: "missing-key", lastErrorDetail: null });
      return false;
    }
    set({ status: "testing" });
    try {
      // Validate against the provider the picker actually points at. A hardcoded
      // preset reported 401 for every other vendor's key, which made the
      // extension slot in decisions #11 unusable; 小青 is local, so fall back to
      // the polish model's provider in that case.
      const selected = get().chatModel;
      const provider =
        (selected === LOCAL_MODEL_ID ? undefined : getChatProvider(selected)) ??
        getChatProvider(get().polishModel) ??
        getChatProvider(DEFAULT_POLISH_MODEL_ID);
      if (!provider) throw new AiError("bad-response", "no chat provider registered");
      await withTimeout((signal) => provider.testKey(key, signal), KEY_TEST_TIMEOUT_MS);
      set({ status: "idle", lastErrorCode: null, lastErrorDetail: null });
      return true;
    } catch (error) {
      const aiError = toAiError(error);
      set({
        status: "idle",
        lastErrorCode: aiError.code,
        lastErrorDetail: aiError.detail ?? null,
      });
      return false;
    }
  },

  recordError: (error) => {
    const aiError = toAiError(error);
    set({ lastErrorCode: aiError.code, lastErrorDetail: aiError.detail ?? null });
  },

  clearError: () => set({ lastErrorCode: null, lastErrorDetail: null }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setChatModel: (modelId) => {
    const chatModel = normalizeChatModel(modelId);
    set({ chatModel });
    void persistPreferences(get());
  },

  setPolishModel: (modelId) => {
    const polishModel = normalizePolishModel(modelId);
    set({ polishModel });
    void persistPreferences(get());
  },

  setSearchEnabled: (enabled) => {
    set({ searchEnabled: enabled });
    void persistPreferences(get());
  },

  setNoteWriteMode: (mode) => {
    set({ noteWriteMode: normalizeNoteWriteMode(mode) });
    void persistPreferences(get());
  },

  undoMessageEdits: async (messageId) => {
    const message = get().messages.find((m) => m.id === messageId);
    if (!message?.edits?.length) return;
    // Reverse order so stacked edits of the same note unwind correctly.
    const pending = [...message.edits].reverse().filter((edit) => !edit.undone);
    // Only a successful restore flips the flag; a lost snapshot keeps the
    // button visible instead of claiming an undo that never happened.
    const restored = new Set<AiNoteEdit>();
    for (const edit of pending) {
      if (await undoNoteEdit(edit)) restored.add(edit);
    }
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              edits: m.edits?.map((edit) =>
                edit.undone || restored.has(edit) ? { ...edit, undone: true } : edit,
              ),
            }
          : m,
      ),
    }));
    syncConversations(set, get);
  },

  sendMessage: async (text) => {
    const trimmed = text.trim();
    // The re-entry guard has to flip before the first await: retrieval takes a
    // while, and a second Enter during it would start a turn the shared abort
    // controller can no longer stop.
    if (!trimmed || get().sending) return;

    const assistantId = newId();
    const now = Date.now();
    const activeId = get().activeConversationId;
    const conversationId = activeId ?? newId();
    const questionIndex = get().messages.length;
    const controller = new AbortController();
    abortController = controller;
    set((state) => ({
      messages: [
        ...state.messages,
        { id: newId(), role: "user", content: trimmed, hits: [], createdAt: now },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          hits: [],
          streaming: true,
          phase: "retrieving" as AiTurnPhase,
          createdAt: now,
        },
      ],
      sending: true,
      activeConversationId: conversationId,
      // First message of a fresh chat names the conversation.
      conversations: activeId
        ? state.conversations
        : [
            ...state.conversations,
            {
              id: conversationId,
              title: conversationTitleFrom(trimmed),
              createdAt: now,
              updatedAt: now,
              messages: [],
            },
          ],
    }));

    // Retrieval runs after both bubbles are on screen: the composer clears the
    // draft on submit, so a slow or failing index must never make the question
    // vanish without a trace. Failure degrades to "no context", not to a lost
    // turn.
    let hits: ManualHit[] = [];
    try {
      hits = await searchKnowledge(trimmed, 4);
    } catch (error) {
      console.warn("ai: knowledge retrieval failed", error);
    }
    set((state) => ({
      messages: state.messages.map((m) => (m.id === assistantId ? { ...m, hits } : m)),
    }));
    // Stopped while the index was rebuilding: keep the question, end the turn.
    if (controller.signal.aborted) {
      if (abortController === controller) abortController = null;
      set((state) => ({
        sending: false,
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, phase: undefined } : m,
        ),
      }));
      syncConversations(set, get);
      return;
    }

    await runGeneration(assistantId, trimmed, hits, questionIndex, controller, set, get);
  },

  regenerate: async (assistantId) => {
    if (get().sending) return;
    const { messages } = get();
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index < 0 || messages[index].role !== "assistant") return;
    // The question that produced this answer: nearest user message above it.
    let questionIndex = -1;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        questionIndex = i;
        break;
      }
    }
    if (questionIndex < 0) return;
    const question = messages[questionIndex];

    const newAssistantId = newId();
    const controller = new AbortController();
    abortController = controller;
    // Insert the fresh reply right after the old one so both stay comparable.
    set((state) => {
      const at = state.messages.findIndex((m) => m.id === assistantId);
      if (at < 0) return { messages: state.messages };
      const next = [...state.messages];
      next.splice(at + 1, 0, {
        id: newAssistantId,
        role: "assistant",
        content: "",
        hits: [],
        streaming: true,
        phase: "retrieving",
        createdAt: Date.now(),
      });
      return { messages: next, sending: true };
    });

    let hits: ManualHit[] = [];
    try {
      hits = await searchKnowledge(question.content, 4);
    } catch (error) {
      console.warn("ai: knowledge retrieval failed", error);
    }
    set((state) => ({
      messages: state.messages.map((m) => (m.id === newAssistantId ? { ...m, hits } : m)),
    }));
    if (controller.signal.aborted) {
      if (abortController === controller) abortController = null;
      set((state) => ({
        sending: false,
        messages: state.messages.map((m) =>
          m.id === newAssistantId ? { ...m, streaming: false, phase: undefined } : m,
        ),
      }));
      syncConversations(set, get);
      return;
    }

    await runGeneration(
      newAssistantId,
      question.content,
      hits,
      questionIndex,
      controller,
      set,
      get,
    );
  },

  deleteMessage: (id) => {
    set((state) => {
      const index = state.messages.findIndex((m) => m.id === id);
      if (index < 0) return { messages: state.messages };
      const target = state.messages[index];
      const remove = new Set<string>([id]);
      // Pair deletion: a question takes its answer, an answer takes its question.
      if (target.role === "user") {
        const answer = state.messages[index + 1];
        if (answer && answer.role === "assistant") remove.add(answer.id);
      } else {
        const question = state.messages[index - 1];
        if (question && question.role === "user") remove.add(question.id);
      }
      return { messages: state.messages.filter((m) => !remove.has(m.id)) };
    });
    syncConversations(set, get);
  },

  stopGenerating: () => {
    abortController?.abort();
    abortController = null;
    set({ sending: false });
  },

  clearChat: () => {
    // Clearing removes the conversation itself, not just its messages: an
    // empty entry would otherwise stay in the history list (which is exactly
    // what `stashActiveConversation` drops). The next question starts fresh.
    const { activeConversationId } = get();
    set((state) => ({
      messages: [],
      activeConversationId: null,
      conversations: activeConversationId
        ? state.conversations.filter((c) => c.id !== activeConversationId)
        : state.conversations,
    }));
    if (activeConversationId) void deleteAiConversation(activeConversationId);
  },

  newConversation: () => {
    if (get().sending) get().stopGenerating();
    stashActiveConversation(set, get);
    set({ activeConversationId: null, messages: [] });
  },

  switchConversation: (id) => {
    if (id === get().activeConversationId) return;
    if (get().sending) get().stopGenerating();
    stashActiveConversation(set, get);
    const target = get().conversations.find((c) => c.id === id);
    if (!target) return;
    set({
      activeConversationId: id,
      messages: target.messages.map(
        (m) => ({ ...m, streaming: false }) as AiChatMessage,
      ),
    });
  },

  renameConversation: (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const next = get().conversations.map((c) =>
      c.id === id ? { ...c, title: trimmed } : c,
    );
    set({ conversations: next });
    const renamed = next.find((c) => c.id === id);
    if (renamed) void saveAiConversation(renamed);
  },

  deleteConversation: (id) => {
    set({ conversations: get().conversations.filter((c) => c.id !== id) });
    void deleteAiConversation(id);
    if (get().activeConversationId === id) {
      set({ activeConversationId: null, messages: [] });
    }
  },

  startPolish: (session) =>
    set({ polish: { ...session, id: newId() }, polishApplied: false }),

  setPolishApplied: (applied) => set({ polishApplied: applied }),

  cancelPolish: () => set({ polish: null, polishApplied: false }),
}));
