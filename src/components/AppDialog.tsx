import { useEffect, useRef } from "react";
import { AlertTriangle, Info, Loader2, OctagonAlert } from "lucide-react";
import { useDialogStore, type AppDialogTone, type AppProgress } from "@/stores/dialogStore";
import { pauseShortcuts, resumeShortcuts } from "@/utils/shortcutManager";
import { useSettingsStore } from "@/stores/settingsStore";
import { tWithParams } from "@/utils/i18n";

const TONE_STYLES: Record<AppDialogTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "bg-accent-light text-accent" },
  warning: { icon: AlertTriangle, className: "bg-warning/12 text-warning" },
  danger: { icon: OctagonAlert, className: "bg-danger/12 text-danger" },
};

const BACKDROP_STYLE = {
  backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))",
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

const PANEL_CLASS =
  "app-modal-panel flex w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border bg-bg-primary shadow-xl";

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
  const { icon: Icon, className: iconClassName } = TONE_STYLES[tone];
  const destructive = tone === "danger";
  const percent = progress ? progressPercent(progress) : null;

  return (
    <>
      {request && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center px-4"
          style={BACKDROP_STYLE}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            className={`${PANEL_CLASS} max-h-[72vh]`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`app-dialog-title-${request.id}`}
          >
            <div className="flex items-start gap-3 px-5 py-4">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={`app-dialog-title-${request.id}`} className="text-sm font-semibold text-text-primary">
                  {request.title}
                </h2>
                {request.body && (
                  <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-relaxed text-text-secondary">
                    {request.body}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              {request.cancelLabel && (
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-text-secondary
                    transition-colors hover:bg-bg-hover hover:text-text-primary cursor-pointer"
                >
                  {request.cancelLabel}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                onClick={() => close(true)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer
                  ${destructive ? "bg-danger text-on-danger hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover"}`}
              >
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {progress && (
        // Rendered on top of everything and without a dismiss affordance: the
        // task owns the files, cancelling halfway would be worse than waiting.
        <div
          className="app-modal-backdrop fixed inset-0 z-[10001] flex items-center justify-center px-4"
          style={BACKDROP_STYLE}
        >
          <div className={`${PANEL_CLASS} max-w-[400px]`} role="status" aria-live="polite">
            <div className="flex items-center gap-2.5 px-5 py-4">
              <Loader2 size={16} className="animate-spin text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">{progress.title}</h2>
              {percent !== null && (
                <span className="ml-auto text-xs font-medium tabular-nums text-text-primary">{percent}%</span>
              )}
            </div>
            <div className="px-5 pb-5">
              <p className="mb-2 text-xs text-text-secondary">
                {progress.totalFiles > 0
                  ? tWithParams(lang, "storageMigrating", {
                      files: progress.files,
                      total: progress.totalFiles,
                    })
                  : progress.label}
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
