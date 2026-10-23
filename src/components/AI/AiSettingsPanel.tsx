import React, { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAiStore } from "@/stores/aiStore";
import { t } from "@/utils/i18n";
import { DEEPSEEK_MODEL, type AiErrorCode } from "@/utils/ai/provider";

type Feedback = { tone: "ok" | "error"; text: string } | null;

function errorText(code: AiErrorCode | null, lang: "zh" | "en"): string {
  switch (code) {
    case "missing-key":
      return t(lang, "aiErrorMissingKey");
    case "unauthorized":
      return t(lang, "aiErrorUnauthorized");
    case "insufficient-balance":
      return t(lang, "aiErrorBalance");
    case "rate-limited":
      return t(lang, "aiErrorRateLimit");
    case "server":
      return t(lang, "aiErrorServer");
    case "bad-response":
      return t(lang, "aiErrorBadResponse");
    case "aborted":
      return t(lang, "aiErrorAborted");
    case "network":
      return t(lang, "aiErrorNetwork");
    default:
      return t(lang, "aiErrorNetwork");
  }
}

const AiSettingsPanel: React.FC = () => {
  const { lang } = useSettingsStore();
  const {
    hasKey,
    loaded,
    status,
    hydrate,
    saveKey,
    clearKey,
    verifyKey,
    searchEnabled,
    setSearchEnabled,
  } = useAiStore();

  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const busy = status === "saving" || status === "testing";
  const canSave = draft.trim().length > 0 && !busy;

  const handleSave = async () => {
    if (!draft.trim()) return;
    const ok = await saveKey(draft);
    if (ok) {
      setDraft("");
      setReveal(false);
      setFeedback({ tone: "ok", text: t(lang, "aiKeySaved") });
    } else {
      const code = useAiStore.getState().lastErrorCode;
      setFeedback({ tone: "error", text: errorText(code, lang) });
    }
  };

  const handleVerify = async () => {
    const candidate = draft.trim();
    if (candidate) {
      const saved = await saveKey(candidate);
      if (!saved) {
        const code = useAiStore.getState().lastErrorCode;
        setFeedback({ tone: "error", text: errorText(code, lang) });
        return;
      }
      setDraft("");
      setReveal(false);
    }
    const ok = await verifyKey();
    if (ok) {
      // The same key powers chat and 联网搜索: one test covers both.
      setFeedback({
        tone: "ok",
        text: t(lang, searchEnabled ? "aiVerifySuccessSearch" : "aiVerifySuccess"),
      });
    } else {
      const code = useAiStore.getState().lastErrorCode;
      setFeedback({ tone: "error", text: errorText(code, lang) });
    }
  };

  const handleClear = async () => {
    await clearKey();
    setDraft("");
    setReveal(false);
    setFeedback({ tone: "ok", text: t(lang, "aiKeyCleared") });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/60 bg-bg-secondary/35 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent ring-1 ring-accent/20">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-text-primary">
              {t(lang, "aiApiKey")}
            </h3>
            <p className="text-xs text-text-muted">{DEEPSEEK_MODEL}</p>
          </div>
          <span
            className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-xs ${
              hasKey ? "bg-accent-light text-accent" : "bg-bg-hover text-text-muted"
            }`}
          >
            {hasKey ? t(lang, "aiKeySaved") : t(lang, "aiKeyMissing")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type={reveal ? "text" : "password"}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFeedback(null);
              }}
              placeholder={
                hasKey && !draft ? "••••••••••••••••" : t(lang, "aiApiKeyPlaceholder")
              }
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 pr-9 text-sm text-text-primary outline-none transition-colors focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "hide" : "show"}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-text-muted transition-colors hover:text-text-primary"
            >
              {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex-shrink-0 cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-bg-primary shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(lang, "aiSaveKey")}
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          {t(lang, "aiApiKeyHint")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleVerify}
            disabled={busy || (!draft.trim() && !hasKey)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:bg-bg-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "testing" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            {t(lang, "aiVerifyKey")}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasKey || busy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-muted transition-all hover:bg-bg-hover hover:text-text-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={13} />
            {t(lang, "aiClearKey")}
          </button>

          {feedback && (
            <span
              className={`text-xs ${
                feedback.tone === "ok" ? "text-accent" : "text-danger"
              }`}
            >
              {feedback.text}
            </span>
          )}
          {!feedback && !loaded && (
            <span className="text-xs text-text-muted">{t(lang, "aiKeyMissing")}</span>
          )}
        </div>
      </section>

      {/* Real-time web search: DeepSeek's own search endpoint, same BYOK key. */}
      <section className="rounded-2xl border border-border/60 bg-bg-secondary/35 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent ring-1 ring-accent/20">
            <Globe size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-text-primary">
              {t(lang, "aiSearchTitle")}
            </h3>
          </div>
          <span
            className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-xs ${
              hasKey ? "bg-accent-light text-accent" : "bg-bg-hover text-text-muted"
            }`}
          >
            {hasKey ? t(lang, "aiKeySaved") : t(lang, "aiKeyMissing")}
          </span>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={searchEnabled}
            onChange={(event) => setSearchEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--accent,#4f8cff)]"
          />
          <span className="min-w-0">
            <span className="block text-sm text-text-primary">
              {t(lang, "aiSearchToggleLabel")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
              {t(lang, "aiSearchToggleHint")}
            </span>
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-border/60 bg-bg-secondary/20 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-bg-hover text-text-muted">
            <ShieldCheck size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary">
              {t(lang, "aiPrivacyNoticeTitle")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t(lang, "aiPrivacyNoticeBody")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AiSettingsPanel;
