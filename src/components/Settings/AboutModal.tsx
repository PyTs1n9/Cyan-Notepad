import { useState, useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { X, ExternalLink, RefreshCw, Download, CheckCircle, AlertCircle, Loader2, QrCode } from "lucide-react";
import { openInDefaultBrowser } from "@/utils/externalLinks";

const GITHUB_URL = "https://github.com/PyTs1n9/Cyan-Notepad";
const GITHUB_API_LATEST = "https://api.github.com/repos/PyTs1n9/Cyan-Notepad/releases/latest";
const APP_VERSION = "0.3.1";
const SPONSOR_IMAGES = Object.entries(
  import.meta.glob("@/assets/sponsors/*.{jpg,jpeg,png,webp,gif,svg}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
)
  .map(([path, src]) => ({
    src,
    label:
      path
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") || "Sponsor",
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

type UpdateStatus = "idle" | "checking" | "upToDate" | "newVersion" | "error";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  const lang = useSettingsStore((s) => s.lang);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState("");
  const [releaseUrl, setReleaseUrl] = useState(GITHUB_URL + "/releases");
  const [sponsorOpen, setSponsorOpen] = useState(false);

  const checkUpdate = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      const res = await fetch(GITHUB_API_LATEST);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const tag = (data.tag_name || "").replace(/^v/, "");
      if (!tag) throw new Error("No version");
      setLatestVersion(tag);
      if (data.html_url) setReleaseUrl(data.html_url);
      setUpdateStatus(tag === APP_VERSION ? "upToDate" : "newVersion");
    } catch {
      setUpdateStatus("error");
    }
  }, []);

  const openReleasePage = useCallback(() => {
    openInDefaultBrowser(releaseUrl);
  }, [releaseUrl]);

  const openGitHubPage = useCallback(() => {
    openInDefaultBrowser(GITHUB_URL);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-bg-secondary border border-border rounded-xl shadow-2xl w-[360px] p-6 animate-in">
        {/* Close button */}
        <button
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-bg-hover transition-colors text-text-muted"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        {/* App icon area */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
            <span className="text-3xl font-bold text-accent">C</span>
          </div>

          {/* App name - clickable GitHub link */}
          <button
            type="button"
            onClick={openGitHubPage}
            className="text-lg font-semibold text-accent hover:underline inline-flex items-center gap-1.5"
          >
            Cyan Notepad
            <ExternalLink size={15} />
          </button>

          {/* Version */}
          <p className="text-xs text-text-muted mt-1">
            {t(lang, "version")} {APP_VERSION}
          </p>
        </div>

        {/* Update check area */}
        <div className="mt-4 px-3 py-2.5 rounded-lg bg-bg-primary">
          {updateStatus === "idle" && (
            <button
              onClick={checkUpdate}
              className="w-full flex items-center justify-between text-sm hover:text-accent transition-colors"
            >
              <span className="text-text-muted">{t(lang, "checkUpdate")}</span>
              <RefreshCw size={14} className="text-text-muted" />
            </button>
          )}
          {updateStatus === "checking" && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{t(lang, "checkingUpdate")}</span>
              <Loader2 size={14} className="text-accent animate-spin" />
            </div>
          )}
          {updateStatus === "upToDate" && (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircle size={14} />
              <span>{t(lang, "upToDate")}</span>
            </div>
          )}
          {updateStatus === "newVersion" && (
            <button
              onClick={openReleasePage}
              className="w-full flex items-center justify-between text-sm hover:opacity-80 transition-opacity"
            >
              <span className="text-blue-500">
                {tWithParams(lang, "newVersion", { version: latestVersion })}
              </span>
              <span className="text-blue-500 flex items-center gap-1 text-xs">
                <Download size={12} />
                {t(lang, "downloadUpdate")}
              </span>
            </button>
          )}
          {updateStatus === "error" && (
            <button
              onClick={checkUpdate}
              className="w-full flex items-center justify-between text-sm hover:opacity-80 transition-opacity"
            >
              <span className="text-red-500 flex items-center gap-1.5">
                <AlertCircle size={14} />
                {t(lang, "checkUpdateFailed")}
              </span>
              <RefreshCw size={14} className="text-red-500" />
            </button>
          )}
        </div>

        {/* Info rows */}
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-bg-primary">
            <span className="text-text-muted">{t(lang, "author")}</span>
            <span className="font-medium">PyTs1N9</span>
          </div>

          <button
            type="button"
            onClick={openGitHubPage}
            className="w-full flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-bg-primary hover:bg-bg-hover transition-colors cursor-pointer"
          >
            <span className="text-text-muted">{t(lang, "sourceCode")}</span>
            <span className="text-accent text-xs flex items-center gap-1">
              GitHub
              <ExternalLink size={12} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSponsorOpen(true)}
            className="w-full flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-bg-primary hover:bg-bg-hover transition-colors cursor-pointer"
          >
            <span className="text-text-muted">{t(lang, "friendSponsor")}</span>
            <QrCode size={16} className="text-accent" />
          </button>
        </div>
      </div>

      {sponsorOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/45" onClick={() => setSponsorOpen(false)} />

          <div className="relative w-[min(92vw,760px)] max-h-[88vh] overflow-auto rounded-xl border border-border bg-bg-secondary p-5 shadow-2xl animate-in">
            <button
              className="absolute top-3 right-3 p-1 rounded-md hover:bg-bg-hover transition-colors text-text-muted"
              onClick={() => setSponsorOpen(false)}
              aria-label={t(lang, "close")}
            >
              <X size={16} />
            </button>

            <div className="mb-4 pr-8">
              <h2 className="text-base font-semibold text-text-primary">{t(lang, "friendSponsor")}</h2>
            </div>

            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
              {SPONSOR_IMAGES.map((image) => (
                <div key={image.src} className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-bg-primary">
                  <img
                    src={image.src}
                    alt={`${t(lang, "friendSponsor")} ${image.label}`}
                    className="h-full w-full object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
