import { useEffect, useState, type PointerEventHandler } from "react";

interface SidebarResizeHandleProps {
  onPointerDown: () => void;
  /**
   * `gutter` is the sash between two shell cards: it is as wide as the shell
   * gutter and doubles as that gap. `inline` is the 5px sash used strictly
   * inside a panel (the workspace view's own sidebar), which must not steal
   * room from the card it lives in.
   */
  variant?: "gutter" | "inline";
}

/**
 * Vertical sash between a sidebar and the main pane.
 *
 * One element, three states. Nothing is painted at rest - the gutter's job when
 * nobody is reaching for it is to be empty space between floating cards. Hover
 * fades in a 2px accent divider that fades out at both ends (a solid bar would
 * cut the window in two; a crease belongs to the gap). Dragging adds width and
 * the glow, which is the only depth cue left once `.sidebar-resizing` drops the
 * cards' shadows for redraw cost.
 *
 * The drag state is an attribute rather than a class because `:hover` stops
 * matching the moment the pointer leaves a 6px strip mid-drag; `data-dragging`
 * keeps the feedback alive for the whole gesture.
 */
export default function SidebarResizeHandle({ onPointerDown, variant = "inline" }: SidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const stopDragging = () => setDragging(false);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    window.addEventListener("blur", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      window.removeEventListener("blur", stopDragging);
    };
  }, [dragging]);

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onPointerDown();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      data-dragging={dragging || undefined}
      onPointerDown={handlePointerDown}
      className={`seam relative h-full flex-shrink-0 touch-none cursor-col-resize ${
        variant === "gutter" ? "w-[var(--shell-gutter)]" : "w-[5px]"
      }`}
    >
      {/* The divider is the affordance: rest and hover differ only in intensity,
          so there is nothing else to paint here. */}
      <span aria-hidden="true" className="seam-line" />
    </div>
  );
}
