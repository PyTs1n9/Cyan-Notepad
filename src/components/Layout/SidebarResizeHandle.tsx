import { useEffect, useState, type PointerEventHandler } from "react";

interface SidebarResizeHandleProps {
  onPointerDown: () => void;
}

export default function SidebarResizeHandle({ onPointerDown }: SidebarResizeHandleProps) {
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
      className="group relative h-full w-2 flex-shrink-0 touch-none cursor-col-resize bg-border"
    >
      <span
        aria-hidden="true"
        className={`sidebar-resize-guide pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          dragging ? "sidebar-resize-guide--active bg-accent" : "bg-accent/30 group-hover:bg-accent/60"
        }`}
      />
    </div>
  );
}
