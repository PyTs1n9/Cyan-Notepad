import { useEffect, useRef } from "react";
import { AlertTriangle, Info, Loader2, OctagonAlert } from "lucide-react";
import { useDialogStore, type AppDialogTone, type AppProgress } from "@/stores/dialogStore";
import { pauseShortcuts, resumeShortcuts } from "@/utils/shortcutManager";
import { useSettingsStore } from "@/stores/settingsStore";
import { tWithParams } from "@/utils/i18n";
import ModalShell from "@/components/Layout/ModalShell";

const TONE_ICON: Record<AppDialogTone, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  danger: OctagonAlert,
};

function progressPercent(progress: AppProgress): number | null {
  if (progress.totalBytes > 0) {
    return Math.max(0, Math.min(100, Math.round((progress.bytes / progress.totalBytes) * 100)));
  }
  if (progress.totalFiles > 0) {
    return Math.max(0, Math.min(100, Math.round((progress.files / progress.totalFiles) * 100)));
  }
  // Still counting the source: no percentage exists yet.
  return null;
}

/**
 * Single host for app-styled confirmations, notices and long-task progress.
 * Mounted once in `App`; driven through `dialogStore`.
 */
export default function AppDialog() {
  const request = useDialogStore((state) => state.request);
  const progress = useDialogStore((state) => state.progress);
  const lang = useSettingsStore((state) => state.lang);
  const close = useDialogStore((state) => state.close);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // The modal owns the keyboard: a global shortcut firing behind it could act
  // on the note the user is not looking at.
  useEffect(() => {
    if (!request && !progress) return;
    void pauseShortcuts();
    return () => {
      void resumeShortcuts();
    };
  }, [request, progress]);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
        return;
      }
      // Enter confirms routine prompts only; a destructive one has to be clicked
      // so a stray keypress cannot delete or move data.
      if (event.key === "Enter" && request.tone !== "danger" && !request.cancelLabel) {
        event.preventDefault();
        close(true);
      }
    };
    // Capture phase: the editor and global shortcut handlers also listen here.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [request, close]);

  if (!request && !progress) return null;

  const tone = request?.tone ?? "info";
  const Icon = TONE_ICON[tone];
  const destructive = tone === "danger";
  const percent = progress ? progressPercent(progress) : null;

  return (
    <>
      {request && (
        <ModalShell
          onClose={() => close(false)}
          title={request.title}
          icon={<Icon size={16} />}
          tone={destructive ? "danger" : tone === "warning" ? "warning" : "accent"}
          size="md"
          role="alertdialog"
          initialFocusRef={confirmRef}
          footer={(
            <>
              {request.cancelLabel && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  {request.cancelLabel}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                onClick={() => close(true)}
                className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                  destructive ? "bg-danger text-on-danger hover:bg-danger/90" : "bg-accent text-on-accent hover:bg-accent-hover"
                }`}
              >
                {request.confirmLabel}
              </button>
            </>
          )}
        >
          {request.body && (
            <p className="whitespace-pre-line break-words text-xs leading-relaxed text-text-secondary">
              {request.body}
            </p>
          )}
        </ModalShell>
      )}

      {progress && (
        // Rendered without a dismiss affordance: the task owns the files,
        // cancelling halfway would be worse than waiting.
        <ModalShell
          onClose={() => undefined}
          title={progress.title}
          icon={<Loader2 size={16} className="animate-spin" />}
          size="sm"
          closeDisabled
        >
          <p className="mb-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
            <span className="min-w-0">
              {progress.totalFiles > 0
                ? tWithParams(lang, "storageMigrating", {
                    files: progress.files,
                    total: progress.totalFiles,
                  })
                : progress.label}
            </span>
            {percent !== null && (
              <span className="flex-shrink-0 font-medium tabular-nums text-text-primary">{percent}%</span>
            )}
          </p>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-bg-hover"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            {percent === null ? (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/60" />
            ) : (
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                style={{ width: `${percent}%` }}
              />
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
