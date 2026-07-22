import { useEffect, useState } from "react";

interface EditorZoomOptions {
  initialSize?: number;
  minSize?: number;
  maxSize?: number;
  step?: number;
}

interface EditorContainerRef {
  readonly current: HTMLElement | null;
}

export function useEditorZoom(
  containerRef: EditorContainerRef,
  {
    initialSize = 16,
    minSize = 12,
    maxSize = 32,
    step = 1,
  }: EditorZoomOptions = {},
) {
  const [fontSize, setFontSize] = useState(initialSize);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return;
      const container = containerRef.current;
      if (!container || !(event.target instanceof Node) || !container.contains(event.target)) return;

      event.preventDefault();
      setFontSize((current) => (
        event.deltaY < 0
          ? Math.min(current + step, maxSize)
          : Math.max(current - step, minSize)
      ));
    };

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, true);
  }, [containerRef, maxSize, minSize, step]);

  return fontSize;
}
