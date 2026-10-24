/**
 * Render-error boundary for a settings panel.
 *
 * The app has no root boundary, so an exception anywhere in a panel's render
 * unmounts the whole tree and the window goes blank with nothing to report.
 * Catching it here keeps the surrounding chrome (nav, close button, other
 * sections) alive and prints the message on screen, which is the only way to
 * diagnose a webview without devtools attached.
 */
import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { t } from "@/utils/i18n";

interface PanelErrorBoundaryProps {
  children: React.ReactNode;
  lang: "zh" | "en";
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Also reaches the devtools console when it is attached.
    console.error("settings panel crashed", error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    const { lang, children } = this.props;
    if (!error) return children;
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-text-primary">
              {t(lang, "panelCrashTitle")}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t(lang, "panelCrashBody")}
            </p>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg-primary px-2 py-1.5 text-[11px] leading-relaxed text-danger">
              {error.message || String(error)}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:bg-bg-hover active:scale-95"
            >
              <RotateCcw size={12} />
              {t(lang, "panelCrashRetry")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default PanelErrorBoundary;
