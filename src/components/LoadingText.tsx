interface LoadingTextProps {
  label: string;
  className?: string;
  variant?: "dots" | "bounce";
}

/** Keeps loading feedback compact while making a wait feel active. */
export default function LoadingText({ label, className = "", variant = "dots" }: LoadingTextProps) {
  const baseLabel = label.replace(/(?:\.{3}|…)\s*$/, "");

  if (variant === "bounce") {
    return (
      <span
        className={`loading-bounce-text ${className}`}
        aria-live="polite"
        aria-label={baseLabel}
      >
        {Array.from(baseLabel).map((character, index) => (
          <span
            key={`${character}-${index}`}
            className="loading-bounce-character"
            style={{ animationDelay: `${index * 90}ms` }}
            aria-hidden="true"
          >
            {character === " " ? "\u00a0" : character}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-baseline ${className}`}
      aria-live="polite"
      aria-label={baseLabel}
    >
      <span>{baseLabel}</span>
      <span className="loading-dots" aria-hidden="true">
        <span className="loading-dot">.</span>
        <span className="loading-dot">.</span>
        <span className="loading-dot">.</span>
      </span>
    </span>
  );
}
