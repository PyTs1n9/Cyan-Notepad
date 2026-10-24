import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Shortcut or tip, set in monospace so it reads as a key, not as prose. */
  hint?: string;
  action?: { label: string; onClick: () => void };
}

/**
 * The one empty state. It exists because the same four-line block was written
 * four times with different padding, and because these are the surfaces a
 * first-time user sees most — they deserve the brand face rather than a
 * single line of muted 12px text.
 *
 * Text and icon only, by decision: no illustration.
 */
const EmptyState = ({ icon, title, description, hint, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-bg-secondary/60 text-text-muted">
      {icon}
    </div>
    <p className="brand-face text-[15px] leading-snug text-text-primary">{title}</p>
    {description && (
      <p className="mt-1 max-w-[300px] text-xs leading-relaxed text-text-muted">{description}</p>
    )}
    {hint && (
      <p className="mt-1.5 rounded-md border border-border/60 bg-bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
        {hint}
      </p>
    )}
    {action && (
      <button
        type="button"
        onClick={action.onClick}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent transition-colors cursor-pointer hover:bg-accent-hover"
      >
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
