import type { ReactNode } from "react";

interface ShellStripProps {
  /** Fixed-width content at the start of the row (icon, name). */
  leading?: ReactNode;
  /** Flexible middle. Lives inside a `min-w-0` flex box so text can truncate. */
  children?: ReactNode;
  /** Fixed-width content at the end of the row (filters, actions). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * The 36px strip that sits on top of an editor card.
 *
 * It is the structural twin of `NoteTabBar`: same height (`h-9`), same single
 * bottom hairline, so the strip in the todo and workspace cards lands on the
 * same line as the tab strip in the note card. The note view keeps its own
 * component because its content is a draggable tab strip rather than a static
 * header; everything else composes from this skeleton instead of re-deriving
 * `h-9 border-b` three times.
 */
const ShellStrip: React.FC<ShellStripProps> = ({ leading, children, trailing, className = "" }) => (
  <div
    className={`shell-strip flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 ${className}`}
  >
    {leading}
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    {trailing}
  </div>
);

export default ShellStrip;
