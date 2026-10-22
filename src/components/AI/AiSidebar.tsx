import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  History,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  LOCAL_MODEL_ID,
  useAiStore,
  type AiChatMessage,
  type NoteWriteMode,
} from "@/stores/aiStore";
import { useAuthStore } from "@/stores/authStore";
import { t } from "@/utils/i18n";
import { listChatProviders } from "@/utils/ai/chat";
import { aiErrorText } from "@/utils/ai/errorText";
import { useStreamScroll } from "@/hooks/useStreamScroll";
import { renderMarkdown } from "@/utils/markdown";
import UserAvatar from "@/components/UserAvatar";
import AiPolishPanel from "@/components/AI/AiPolishPanel";

interface AiSidebarProps {
  onOpenSettings: () => void;
}

/**
 * Assistant answers are Markdown (headings, lists, inline code). While the
 * turn streams, the accumulated text is re-rendered as Markdown on a short
 * debounce so blocks grow in place — the turn ends with no raw-source-to-layout
 * flip. At rest the final render runs immediately.
 */
const STREAM_RENDER_DEBOUNCE_MS = 160;

const AssistantBubble: React.FC<{ content: string; streaming?: boolean }> = ({
  content,
  streaming,
}) => {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!content) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      renderMarkdown(content)
        .then((rendered) => {
          if (!cancelled) setHtml(rendered);
        })
        .catch(() => {
          if (!cancelled) setHtml(null);
        });
    }, streaming ? STREAM_RENDER_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content, streaming]);

  const cursor = streaming ? (
    <span className="ai-stream-cursor" aria-hidden="true" />
  ) : null;

  if (html === null) {
    return (
      <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border/60 bg-bg-secondary/50 px-3.5 py-2.5 text-sm leading-relaxed text-text-primary shadow-sm">
        {content}
        {cursor}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl rounded-tl-md border border-border/60 bg-bg-secondary/50 px-3.5 py-2.5 text-sm text-text-primary shadow-sm
        [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-bg-primary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
        [&_h1]:mb-1.5 [&_h1]:mt-1 [&_h1]:text-base [&_h1]:font-semibold
        [&_h2]:mb-1.5 [&_h2]:mt-1 [&_h2]:text-sm [&_h2]:font-semibold
        [&_h3]:mb-1 [&_h3]:mt-1 [&_h3]:text-sm [&_h3]:font-medium
        [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_strong]:font-semibold
        [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_li]:leading-relaxed"
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {cursor}
    </div>
  );
};

/**
 * Thinking-model reasoning stream. Opens while the model is still thinking
 * (no answer text yet) so the wait is visible, then folds away once the answer
 * starts; the user can toggle it either way.
 */
const ReasoningBlock: React.FC<{ reasoning: string; active: boolean }> = ({
  reasoning,
  active,
}) => {
  const lang = useSettingsStore((s) => s.lang);
  const [open, setOpen] = useState(active);
  // The reasoning log scrolls with the stream while it is being produced;
  // re-opening the block lands on the newest lines.
  const { containerRef, contentRef } = useStreamScroll({
    enabled: active,
    resetKey: open ? "open" : "closed",
    threshold: 40,
  });

  useEffect(() => {
    setOpen(active);
  }, [active]);

  return (
    <div className="mb-1.5 rounded-xl border border-border/60 bg-bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-text-muted transition-colors hover:text-text-primary"
      >
        <Brain size={11} className={active ? "animate-pulse" : undefined} />
        <span className="flex-1">
          {active ? t(lang, "aiThinking") : t(lang, "aiReasoning")}
        </span>
        <ChevronDown
          size={11}
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={containerRef}
          className="max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-border/60 px-2.5 py-2 text-[11px] leading-relaxed text-text-muted"
        >
          <div ref={contentRef}>{reasoning}</div>
        </div>
      )}
    </div>
  );
};

/** Assistant avatar tile, shared by the header, bubbles and the empty state. */
const AssistantAvatar: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <div
    className="flex flex-shrink-0 items-center justify-center rounded-full bg-accent-light text-accent ring-1 ring-accent/20"
    style={{ width: size, height: size }}
  >
    <Sparkles size={Math.round(size * 0.54)} />
  </div>
);

function formatTime(timestamp: number, lang: "zh" | "en"): string {
  return new Date(timestamp).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const actionButtonClass =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-90";

interface NoteWritePermissionProps {
  mode: NoteWriteMode;
  disabled: boolean;
  onChange: (mode: NoteWriteMode) => void;
}

/**
 * Two-state note-write permission switch, placed right of the model picker in
 * the input capsule. Enabling "full" always goes through a one-shot risk
 * confirm; falling back to read-only is immediate.
 */
const NoteWritePermission: React.FC<NoteWritePermissionProps> = ({
  mode,
  disabled,
  onChange,
}) => {
  const lang = useSettingsStore((s) => s.lang);
  const reduceMotion = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const enter = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  const segmentClass = (active: boolean, hot = false) =>
    `cursor-pointer rounded-full px-2 py-1 transition-colors ${
      active
        ? hot
          ? "bg-amber-500/90 text-white shadow-sm"
          : "bg-bg-primary text-text-primary shadow-sm"
        : "text-text-muted hover:text-text-primary"
    }`;

  return (
    <div
      className={`relative flex-shrink-0 ${disabled ? "pointer-events-none opacity-40" : ""}`}
      title={disabled ? t(lang, "aiPermLocalOnly") : t(lang, "aiPermLabel")}
    >
      <div className="flex items-center rounded-full border border-border/60 bg-bg-secondary/50 p-0.5 text-[11px]">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onChange("readonly");
          }}
          className={segmentClass(mode === "readonly")}
        >
          {t(lang, "aiPermReadOnly")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(mode !== "full")}
          className={segmentClass(mode === "full", true)}
        >
          {t(lang, "aiPermFull")}
        </button>
      </div>
      <AnimatePresence>
        {confirming && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setConfirming(false)}
            />
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
              transition={enter}
              className="absolute bottom-full right-0 z-20 mb-1.5 w-60 rounded-xl border border-border bg-bg-primary p-3 shadow-lg"
            >
              <p className="text-xs font-medium text-text-primary">
                {t(lang, "aiPermConfirmTitle")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                {t(lang, "aiPermConfirmBody")}
              </p>
              <div className="mt-2.5 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  {t(lang, "aiCancel")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange("full");
                    setConfirming(false);
                  }}
                  className="cursor-pointer rounded-lg bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  {t(lang, "aiPermConfirmOk")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Hover toolbar under a finished assistant bubble: timestamp + copy / regenerate / delete. */
const MessageActions: React.FC<{ message: AiChatMessage }> = ({ message }) => {
  const lang = useSettingsStore((s) => s.lang);
  const { regenerate, deleteMessage, sending } = useAiStore();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // `navigator.clipboard` is absent in some webview contexts; the button
    // simply stays as-is when there is nothing to copy with.
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    try {
      await clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the button just stays.
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 select-none text-[10px] tabular-nums text-text-muted/70">
        {formatTime(message.createdAt, lang)}
      </span>
      {message.content && (
        <button
          type="button"
          onClick={() => void copy()}
          title={copied ? t(lang, "aiCopied") : t(lang, "aiCopy")}
          aria-label={t(lang, "aiCopy")}
          className={actionButtonClass}
        >
          {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => void regenerate(message.id)}
        disabled={sending}
        title={t(lang, "aiRegenerate")}
        aria-label={t(lang, "aiRegenerate")}
        className={`${actionButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <RotateCcw size={12} />
      </button>
      <button
        type="button"
        onClick={() => deleteMessage(message.id)}
        title={t(lang, "aiDeleteMessage")}
        aria-label={t(lang, "aiDeleteMessage")}
        className={`${actionButtonClass} hover:text-danger`}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

/**
 * Prompt-suggestion pool for the empty state. Three are shown at a time;
 * "换一批" resamples without overlapping the current trio so the button
 * always surfaces fresh questions.
 */
const EXAMPLE_KEYS = [
  "aiExampleQ1",
  "aiExampleQ2",
  "aiExampleQ3",
  "aiExampleQ4",
  "aiExampleQ5",
  "aiExampleQ6",
  "aiExampleQ7",
  "aiExampleQ8",
  "aiExampleQ9",
  "aiExampleQ10",
  "aiExampleQ11",
  "aiExampleQ12",
] as const;

const EXAMPLE_COUNT = 3;

/** Pick `count` distinct indices from `poolSize`, excluding `exclude`. */
function sampleExampleIndices(poolSize: number, count: number, exclude: readonly number[]): number[] {
  const candidates = Array.from({ length: poolSize }, (_, i) => i).filter((i) => !exclude.includes(i));
  const source = candidates.length >= count ? candidates : Array.from({ length: poolSize }, (_, i) => i);
  const picked: number[] = [];
  while (picked.length < Math.min(count, source.length)) {
    const [index] = source.splice(Math.floor(Math.random() * source.length), 1);
    picked.push(index);
  }
  return picked;
}

const AiSidebar: React.FC<AiSidebarProps> = ({ onOpenSettings }) => {
  const lang = useSettingsStore((s) => s.lang);
  const {
    messages,
    sending,
    hasKey,
    polish,
    chatModel,
    setChatModel,
    noteWriteMode,
    setNoteWriteMode,
    undoMessageEdits,
    hydrate,
    sendMessage,
    stopGenerating,
    clearChat,
    deleteMessage,
    conversations,
    activeConversationId,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    cancelPolish,
    setSidebarOpen,
  } = useAiStore();
  const authUser = useAuthStore((s) => s.user);
  const reduceMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [exampleIndices, setExampleIndices] = useState<number[]>(() =>
    sampleExampleIndices(EXAMPLE_KEYS.length, EXAMPLE_COUNT, []),
  );
  // Follow-the-bottom scrolling while an answer streams in. `sending` re-arms
  // the follow on every new question; switching conversations re-arms too.
  const { containerRef: scrollRef, contentRef: messagesRef } = useStreamScroll({
    enabled: sending,
    resetKey: activeConversationId,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const authMetadata = authUser?.user_metadata as Record<string, unknown> | undefined;
  const userAvatarUrl =
    typeof authMetadata?.avatar_url === "string" ? authMetadata.avatar_url : null;
  const userDisplayName =
    typeof authMetadata?.display_name === "string" && authMetadata.display_name.trim()
      ? authMetadata.display_name.trim()
      : (authUser?.email?.split("@")[0] ?? "?");

  // Model picker options: 小青 (local retrieval) + every registered provider.
  // Labels are model names ("小青", "deepseek-flash"); the sub carries the vendor.
  const modelOptions = [
    { id: LOCAL_MODEL_ID, label: t(lang, "aiModelLocal"), sub: "" },
    ...listChatProviders().map((p) => ({ id: p.id, label: p.model, sub: p.label })),
  ];
  const activeModel = modelOptions.find((o) => o.id === chatModel) ?? modelOptions[0];
  // 小青 answers by local retrieval only — note writing needs a generative API
  // model, so the permission switch is locked while it is selected.
  const localModelSelected = chatModel === LOCAL_MODEL_ID;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Auto-grow the capsule textarea up to ~5 lines, then let it scroll.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    void sendMessage(text);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const examples = exampleIndices.map((index) => t(lang, EXAMPLE_KEYS[index]));

  const sortedConversations = [...conversations].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  const enter = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <aside
      style={{ width: "var(--ai-sidebar-width)" }}
      className="flex h-full flex-shrink-0 flex-col border-l border-border bg-bg-sidebar"
    >
      {/* Header: assistant identity + status, session controls, clear (with confirm), close */}
      {/* h-9 matches the note tab bar height so this border lands on the same
          line as the tab strip's border across the window. */}
      <div className="flex h-9 flex-shrink-0 items-center gap-2.5 border-b border-border px-3.5">
        <AssistantAvatar size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight text-text-primary">
            {activeModel.label}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                chatModel === LOCAL_MODEL_ID || hasKey ? "bg-green-500" : "bg-text-muted/50"
              }`}
              aria-hidden="true"
            />
            <span className="truncate text-[10px] leading-none text-text-muted">
              {chatModel === LOCAL_MODEL_ID || hasKey
                ? t(lang, "aiStatusReady")
                : t(lang, "aiStatusNoKey")}
            </span>
          </div>
        </div>
        <div className="relative flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              newConversation();
              setConfirmingClear(false);
              setHistoryOpen(false);
            }}
            title={t(lang, "aiNewChat")}
            aria-label={t(lang, "aiNewChat")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setHistoryOpen((value) => !value);
              setConfirmingClear(false);
              setConfirmingDeleteId(null);
            }}
            title={t(lang, "aiHistory")}
            aria-label={t(lang, "aiHistory")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95"
          >
            <History size={15} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingClear((value) => !value)}
            title={t(lang, "aiClearChat")}
            aria-label={t(lang, "aiClearChat")}
            disabled={messages.length === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title={t(lang, "aiClose")}
            aria-label={t(lang, "aiClose")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95"
          >
            <X size={16} />
          </button>

          {/* Clear confirmation popover */}
          <AnimatePresence>
            {confirmingClear && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
                transition={enter}
                className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-border bg-bg-primary p-3 shadow-lg"
              >
                <p className="text-xs font-medium text-text-primary">
                  {t(lang, "aiClearConfirmTitle")}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                  {t(lang, "aiClearConfirmBody")}
                </p>
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmingClear(false)}
                    className="cursor-pointer rounded-lg px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    {t(lang, "aiCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearChat();
                      setConfirmingClear(false);
                    }}
                    className="cursor-pointer rounded-lg bg-danger/90 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    {t(lang, "aiClearConfirmOk")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Conversation history popover: switch / inline rename / delete */}
          <AnimatePresence>
            {historyOpen && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
                transition={enter}
                className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-bg-primary p-1.5 shadow-lg"
              >
                {sortedConversations.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-text-muted">
                    {t(lang, "aiNoConversations")}
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {sortedConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={`group/item flex items-center gap-1 rounded-lg px-2 py-1.5 ${
                          conversation.id === activeConversationId
                            ? "bg-accent-light/50"
                            : "hover:bg-bg-hover"
                        }`}
                      >
                        {renamingId === conversation.id ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                renameConversation(conversation.id, renameDraft);
                                setRenamingId(null);
                              }
                              if (event.key === "Escape") setRenamingId(null);
                            }}
                            onBlur={() => {
                              renameConversation(conversation.id, renameDraft);
                              setRenamingId(null);
                            }}
                            className="min-w-0 flex-1 rounded border border-accent bg-bg-primary px-1.5 py-0.5 text-xs text-text-primary outline-none"
                          />
                        ) : confirmingDeleteId === conversation.id ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[11px] text-danger">
                              {t(lang, "aiDeleteConversationTitle")}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                deleteConversation(conversation.id);
                                setConfirmingDeleteId(null);
                              }}
                              className="flex-shrink-0 cursor-pointer rounded-md bg-danger/90 px-2 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                            >
                              {t(lang, "aiClearConfirmOk")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(null)}
                              className="flex-shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-bg-hover"
                            >
                              {t(lang, "aiCancel")}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                switchConversation(conversation.id);
                                setHistoryOpen(false);
                              }}
                              title={conversation.title}
                              className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs text-text-primary"
                            >
                              {conversation.title || t(lang, "aiUntitled")}
                            </button>
                            <span className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/item:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingId(conversation.id);
                                  setRenameDraft(conversation.title);
                                }}
                                title={t(lang, "aiRename")}
                                aria-label={t(lang, "aiRename")}
                                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:text-text-primary"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingDeleteId(conversation.id)}
                                title={t(lang, "aiDeleteConversation")}
                                aria-label={t(lang, "aiDeleteConversation")}
                                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:text-danger"
                              >
                                <Trash2 size={11} />
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Polish mode replaces the chat area while a selection session is active. */}
      {polish ? (
        <AiPolishPanel onBack={cancelPolish} onOpenSettings={onOpenSettings} />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={enter}
                className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center"
              >
                <AssistantAvatar size={44} />
                <p className="max-w-[240px] text-xs leading-relaxed text-text-muted">
                  {t(lang, "aiGreeting")}
                </p>
                <div className="flex w-full flex-col gap-1.5">
                  {examples.map((question, i) => (
                    <motion.button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question)}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      transition={{ ...enter, delay: reduceMotion ? 0 : 0.05 + i * 0.04 }}
                      className="cursor-pointer rounded-xl border border-border/60 bg-bg-secondary/40 px-3 py-2 text-left text-xs text-text-primary transition-all hover:border-accent/40 hover:bg-accent-light/40 active:scale-[0.98]"
                    >
                      {question}
                    </motion.button>
                  ))}
                  {EXAMPLE_KEYS.length > EXAMPLE_COUNT && (
                    <button
                      type="button"
                      onClick={() =>
                        setExampleIndices((current) =>
                          sampleExampleIndices(EXAMPLE_KEYS.length, EXAMPLE_COUNT, current),
                        )
                      }
                      className="mx-auto mt-1 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95"
                      aria-label={t(lang, "aiShuffleExamples")}
                    >
                      <RefreshCw size={11} />
                      {t(lang, "aiShuffleExamples")}
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <div ref={messagesRef} className="space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <motion.div
                        key={message.id}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                        transition={enter}
                        className="group flex items-start justify-end gap-2"
                      >
                        <div className="flex max-w-[85%] flex-col items-end">
                          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-accent-light px-3.5 py-2.5 text-sm leading-relaxed text-text-primary shadow-sm">
                            {message.content}
                          </div>
                          <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                            <span className="select-none text-[10px] tabular-nums text-text-muted/70">
                              {formatTime(message.createdAt, lang)}
                            </span>
                            <button
                              type="button"
                              onClick={() => deleteMessage(message.id)}
                              title={t(lang, "aiDeleteMessage")}
                              aria-label={t(lang, "aiDeleteMessage")}
                              className={`${actionButtonClass} hover:text-danger`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <UserAvatar
                          name={userDisplayName}
                          avatarUrl={userAvatarUrl}
                          className="h-[26px] w-[26px] bg-accent-light text-[11px] font-semibold text-accent ring-1 ring-accent/20"
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key={message.id}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                        transition={enter}
                        className="group flex items-start gap-2"
                      >
                        <AssistantAvatar />
                        <div className="flex min-w-0 max-w-[85%] flex-col">
                          {message.reasoning ? (
                            <ReasoningBlock
                              reasoning={message.reasoning}
                              active={Boolean(message.streaming && !message.content)}
                            />
                          ) : null}
                          {message.content ? (
                            <AssistantBubble content={message.content} streaming={message.streaming} />
                          ) : message.streaming ? (
                            message.reasoning ? null : (
                              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-border/60 bg-bg-secondary/50 px-3.5 py-2.5 text-sm text-text-muted shadow-sm">
                                <span className="ai-typing-dots" aria-hidden="true">
                                  <span />
                                  <span />
                                  <span />
                                </span>
                                {t(lang, "aiThinking")}
                              </div>
                            )
                          ) : message.hits.length === 0 ? (
                            <div className="rounded-2xl rounded-tl-md border border-border/60 bg-bg-secondary/50 px-3.5 py-2.5 text-sm text-text-muted shadow-sm">
                              {t(lang, "aiNoResult")}
                            </div>
                          ) : null}
                          {message.errorCode && (
                            <div className="mt-1 text-xs text-danger">
                              {aiErrorText(message.errorCode, lang)}
                            </div>
                          )}
                          {message.searchError && !message.streaming && (
                            <div className="mt-1 text-[11px] leading-relaxed text-text-muted">
                              {t(lang, "aiSearchFailed")}
                            </div>
                          )}
                          {message.edits && message.edits.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {message.edits.map((edit, index) => (
                                <span
                                  key={`${edit.noteId}-${index}`}
                                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                    edit.undone
                                      ? "border-border/60 text-text-muted"
                                      : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                                  }`}
                                >
                                  <Pencil size={10} />
                                  {edit.undone
                                    ? t(lang, "aiEditUndone")
                                    : `${t(lang, "aiEditApplied")}${
                                        lang === "zh"
                                          ? `《${edit.noteTitle}》`
                                          : ` "${edit.noteTitle}"`
                                      }`}
                                </span>
                              ))}
                              {!message.streaming &&
                                message.edits.some((edit) => !edit.undone) && (
                                  <button
                                    type="button"
                                    onClick={() => void undoMessageEdits(message.id)}
                                    title={t(lang, "aiUndoEdit")}
                                    className="flex cursor-pointer items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent/40 hover:text-text-primary"
                                  >
                                    <Undo2 size={10} />
                                    {t(lang, "aiUndoEdit")}
                                  </button>
                                )}
                            </div>
                          )}
                          {!message.streaming && (message.content || message.errorCode) && (
                            <div className="mt-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              <MessageActions message={message} />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ),
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Input: one capsule containing the auto-growing textarea with the
              send/stop button embedded at the bottom-right. */}
          <div className="flex-shrink-0 px-3 pb-3 pt-1">
            {!hasKey && chatModel !== LOCAL_MODEL_ID && (
              <div className="mb-2 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-text-muted">
                <span className="min-w-0 flex-1">{t(lang, "aiNoKeyHint")}</span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex-shrink-0 cursor-pointer text-accent underline underline-offset-2"
                >
                  {t(lang, "aiSettings")}
                </button>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-bg-primary px-2.5 py-2 shadow-sm transition-colors focus-within:border-accent">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(lang, "aiInputPlaceholder")}
                rows={1}
                className="max-h-[120px] min-h-[24px] w-full resize-none bg-transparent px-1 py-0.5 text-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted/70"
              />
              {/* Capsule footer: model chip (left) + send/stop (right) */}
              <div className="mt-1 flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => setModelMenuOpen((open) => !open)}
                      title={t(lang, "aiModelLabel")}
                      className="flex max-w-[160px] cursor-pointer items-center gap-1 rounded-full border border-border/60 bg-bg-secondary/50 px-2 py-1 text-[11px] text-text-muted transition-all hover:border-accent/40 hover:text-text-primary active:scale-95"
                    >
                      <Sparkles size={11} className="flex-shrink-0 text-accent" />
                      <span className="truncate">{activeModel.label}</span>
                      <ChevronDown
                        size={11}
                        className={`flex-shrink-0 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <AnimatePresence>
                      {modelMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setModelMenuOpen(false)}
                          />
                          <motion.div
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                            transition={enter}
                            className="absolute bottom-full left-0 z-20 mb-1.5 w-60 overflow-hidden rounded-xl border border-border bg-bg-primary py-1 shadow-lg"
                          >
                            {modelOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setChatModel(option.id);
                                  setModelMenuOpen(false);
                                }}
                                className={`flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors hover:bg-bg-hover ${
                                  option.id === chatModel ? "bg-accent-light/50" : ""
                                }`}
                              >
                                <span className="w-full truncate text-xs font-medium text-text-primary">
                                  {option.label}
                                </span>
                                {option.sub && (
                                  <span className="w-full truncate text-[10px] text-text-muted">
                                    {option.sub}
                                  </span>
                                )}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  {/* Note-write permission switch, right of the model picker */}
                  <NoteWritePermission
                    mode={noteWriteMode}
                    disabled={localModelSelected}
                    onChange={setNoteWriteMode}
                  />
                </div>
                {sending ? (
                  <button
                    type="button"
                    onClick={stopGenerating}
                    title={t(lang, "aiStop")}
                    aria-label={t(lang, "aiStop")}
                    className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-bg-secondary text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-90"
                  >
                    <Square size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!draft.trim()}
                    title={t(lang, "aiSend")}
                    aria-label={t(lang, "aiSend")}
                    className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-bg-primary shadow-sm transition-all hover:brightness-110 active:scale-90 disabled:cursor-not-allowed disabled:bg-accent-light disabled:text-accent disabled:opacity-60"
                  >
                    <Send size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};

export default AiSidebar;
