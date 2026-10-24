import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { openInDefaultBrowser } from "@/utils/externalLinks";
import { APP_VERSION, fetchLatestRelease, isVersionNewer } from "@/utils/updateChecker";

type UpdateState = "checking" | "upToDate" | "newVersion" | "error";

interface UpdateCheckModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * First-class "check for updates" entry (Help → Check for Updates).
 *
 * The four states are explicit and the failure state carries the underlying
 * reason plus a retry, instead of the previous bare "Update check failed" label
 * buried two levels deep inside About.
 */
export default function UpdateCheckModal({ open, onClose }: UpdateCheckModalProps) {
  const lang = useSettingsStore((state) => state.lang);
  const [state, setState] = useState<UpdateState>("checking");
  const [latestVersion, setLatestVersion] = useState("");
  const [releaseUrl, setReleaseUrl] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const check = useCallback(async () => {
    const id = ++requestId.current;
    setState("checking");
    setError("");
    try {
      const release = await fetchLatestRelease();
      if (id !== requestId.current) return;
      setLatestVersion(release.version);
      setReleaseUrl(release.url);
      setState(isVersionNewer(release.version, APP_VERSION) ? "newVersion" : "upToDate");
    } catch (cause) {
      if (id !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (open) void check();
    else requestId.current += 1;
  }, [open, check]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4" role="presentation">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, "checkUpdate")}
        className="relative w-[min(92vw,360px)] rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t(lang, "close")}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <X size={15} />
        </button>

        <h2 className="text-sm font-semibold text-text-primary">{t(lang, "checkUpdate")}</h2>
        <p className="mt-1 text-[11px] text-text-muted">
          {t(lang, "currentVersion")} v{APP_VERSION}
        </p>

        <div className="mt-4 rounded-lg border border-border bg-bg-primary px-3 py-2.5">
          {state === "checking" && (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{t(lang, "checkingUpdate")}</span>
              <Loader2 size={14} className="animate-spin text-accent" />
            </div>
          )}

          {state === "upToDate" && (
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle size={14} />
              <span>{t(lang, "upToDate")}</span>
            </div>
          )}

          {state === "newVersion" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-accent">
                <Download size={14} />
                <span>{tWithParams(lang, "newVersion", { version: latestVersion })}</span>
              </div>
              <button
                type="button"
                onClick={() => void openInDefaultBrowser(releaseUrl)}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                <Download size={13} />
                {t(lang, "downloadUpdate")}
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-danger">
                <AlertCircle size={14} />
                <span>{t(lang, "checkUpdateFailed")}</span>
              </div>
              {error && (
                <p className="break-words text-[11px] leading-4 text-text-muted">
                  {tWithParams(lang, "updateCheckErrorDetail", { detail: error })}
                </p>
              )}
              <button
                type="button"
                onClick={() => void check()}
                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <RefreshCw size={13} />
                {t(lang, "retry")}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
