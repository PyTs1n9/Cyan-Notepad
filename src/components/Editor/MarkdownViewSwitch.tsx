import { Code, Columns2, Eye, type LucideIcon } from "lucide-react";

export type MarkdownViewMode = "source" | "preview" | "split";

/** Render order of the segmented control; the sliding pill indexes into it. */
export const MARKDOWN_VIEW_ORDER: MarkdownViewMode[] = ["source", "preview", "split"];

const VIEW_ICONS: Record<MarkdownViewMode, LucideIcon> = {
  source: Code,
  preview: Eye,
  split: Columns2,
};

interface MarkdownViewSwitchProps {
  value: MarkdownViewMode;
  onChange: (mode: MarkdownViewMode) => void;
  /** Accessible names / tooltips, one per mode. The control itself is icon-only. */
  labels: Record<MarkdownViewMode, string>;
  /** Extra classes for the track, e.g. spacing tweaks in a given toolbar. */
  className?: string;
  iconSize?: number;
}

/**
 * Icon-only 源码 / 预览 / 分屏 switch shared by the local and cloud editors.
 * Labels live in `title` / `aria-label` so the toolbar only costs one row and
 * roughly half the horizontal space the text version needed.
 */
const MarkdownViewSwitch = ({
  value,
  onChange,
  labels,
  className,
  iconSize = 15,
}: MarkdownViewSwitchProps) => {
  const activeIndex = Math.max(0, MARKDOWN_VIEW_ORDER.indexOf(value));

  return (
    <div
      role="group"
      className={`relative grid h-8 shrink-0 grid-cols-3 items-center overflow-hidden rounded-full bg-bg-secondary p-0.5 ${
        className ?? ""
      }`}
    >
      <div
        className="markdown-view-pill pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full"
        style={{
          width: "calc((100% - 4px) / 3)",
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      >
        <span key={value} className="markdown-view-pill-fill" />
      </div>
      {MARKDOWN_VIEW_ORDER.map((mode) => {
        const Icon = VIEW_ICONS[mode];
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            title={labels[mode]}
            aria-label={labels[mode]}
            aria-pressed={active}
            className={`relative z-10 flex h-7 w-9 cursor-pointer items-center justify-center rounded-full leading-none transition-colors duration-150 ${
              active
                ? "text-on-accent"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <Icon size={iconSize} />
          </button>
        );
      })}
    </div>
  );
};

export default MarkdownViewSwitch;
