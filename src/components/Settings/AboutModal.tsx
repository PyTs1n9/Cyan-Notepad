import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { X, ExternalLink } from "lucide-react";

const GITHUB_URL = "https://github.com/Pytsing/BaiQingTodo";
const APP_VERSION = "0.1.0";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutModal({ open, onClose }: AboutModalProps) {
  const lang = useSettingsStore((s) => s.lang);

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
            <span className="text-3xl font-bold text-accent">B</span>
          </div>

          {/* App name - clickable GitHub link */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold text-accent hover:underline inline-flex items-center gap-1.5"
          >
            BaiQingTodo
            <ExternalLink size={15} />
          </a>

          {/* Version */}
          <p className="text-xs text-text-muted mt-1">
            {t(lang, "version")} {APP_VERSION}
          </p>
        </div>

        {/* Info rows */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-bg-primary">
            <span className="text-text-muted">{t(lang, "author")}</span>
            <span className="font-medium">Pytsing</span>
          </div>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-bg-primary hover:bg-bg-hover transition-colors cursor-pointer"
          >
            <span className="text-text-muted">{t(lang, "sourceCode")}</span>
            <span className="text-accent text-xs flex items-center gap-1">
              GitHub
              <ExternalLink size={12} />
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
