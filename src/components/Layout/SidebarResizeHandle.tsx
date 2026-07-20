import { useEffect, useState, type MouseEventHandler } from "react";

interface SidebarResizeHandleProps {
  onMouseDown: MouseEventHandler<HTMLDivElement>;
}

export default function SidebarResizeHandle({ onMouseDown }: SidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const stopDragging = () => setDragging(false);
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(event) => {
        setDragging(true);
        onMouseDown(event);
      }}
      className="group relative h-full w-2 flex-shrink-0 cursor-col-resize bg-border"
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
