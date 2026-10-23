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
 * Skinless by design (VS Code): the grab strip itself paints nothing, so the
 * two panels keep their own backgrounds and only a hairline marks the boundary.
 * The accent bar is revealed on hover and stays lit while dragging. Nothing
 * animates its width - the 3px bar only fades in, so hovering never reflows.
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
      onPointerDown={handlePointerDown}
      className={`group relative h-full flex-shrink-0 touch-none cursor-col-resize bg-transparent ${
        variant === "gutter" ? "w-[var(--shell-gutter)]" : "w-[5px]"
      }`}
    >
      {/* The boundary itself: one hairline, the only thing visible at rest. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
      />
      {/* Grab affordance: opaque only while hovered or dragged. */}
      <span
        aria-hidden="true"
        className={`sidebar-resize-guide pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition-opacity duration-150 ease-out motion-reduce:transition-none ${
          dragging
            ? "sidebar-resize-guide--active bg-accent opacity-100"
            : "bg-accent/60 opacity-0 group-hover:opacity-100"
        }`}
      />
    </div>
  );
}
