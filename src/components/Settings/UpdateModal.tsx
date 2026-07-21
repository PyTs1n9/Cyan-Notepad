import { BellOff, Clock3, Download } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";

interface UpdateModalProps {
  currentVersion: string;
  latestVersion: string;
  onUpdateNow: () => void;
  onUpdateLater: () => void;
  onNeverRemind: () => void;
}

export default function UpdateModal({
  currentVersion,
  latestVersion,
  onUpdateNow,
  onUpdateLater,
  onNeverRemind,
}: UpdateModalProps) {
  const lang = useSettingsStore((state) => state.lang);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-[min(92vw,410px)] rounded-xl border border-border bg-bg-secondary p-6 shadow-2xl animate-in">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Download size={20} />
          </div>
          <div>
            <h2 id="update-modal-title" className="text-base font-semibold text-text-primary">
              {t(lang, "updateAvailableTitle")}
            </h2>
            <p className="mt-1 text-sm leading-5 text-text-muted">
              {tWithParams(lang, "updateAvailableMessage", { version: latestVersion })}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-bg-primary px-3 py-2.5 text-xs">
          <div>
            <div className="text-text-muted">{t(lang, "currentVersion")}</div>
            <div className="mt-0.5 font-medium text-text-primary">v{currentVersion}</div>
          </div>
          <div>
            <div className="text-text-muted">{t(lang, "latestVersion")}</div>
            <div className="mt-0.5 font-medium text-accent">v{latestVersion}</div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onUpdateNow}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Download size={15} />
            {t(lang, "updateNow")}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onUpdateLater}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
            >
              <Clock3 size={14} />
              {t(lang, "updateLater")}
            </button>
            <button
              type="button"
              onClick={onNeverRemind}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <BellOff size={14} />
              {t(lang, "neverRemind")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
