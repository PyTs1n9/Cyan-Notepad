import { useEffect, useRef, type RefObject } from "react";

/** Distance from the bottom (px) within which the user counts as "at the bottom". */
const DEFAULT_THRESHOLD = 80;

export interface UseStreamScrollOptions {
  /**
   * Marks a live stream. A false→true transition re-arms following and pins to
   * the bottom (a fresh question always lands on the newest content); it does
   * not pause following when it returns to false.
   */
  enabled: boolean;
  /** Changing this value re-arms following and pins to the bottom (e.g. conversation switch). */
  resetKey?: string | number | null;
  threshold?: number;
}

export interface StreamScrollRefs {
  /** The scroll container (the element with overflow-y-auto). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The growing content inside the container. */
  contentRef: RefObject<HTMLDivElement | null>;
}

/**
 * Follow-the-content scrolling for AI streaming surfaces.
 *
 * Pins the viewport to the bottom while content grows — including growth that
 * lands after render (async Markdown, images) via a ResizeObserver — so a
 * streaming answer scrolls with the text instead of freezing in place. If the
 * user scrolls away from the bottom, following pauses; it resumes when they
 * scroll back near the bottom or a new stream starts.
 */
export function useStreamScroll({
  enabled,
  resetKey = null,
  threshold = DEFAULT_THRESHOLD,
}: UseStreamScrollOptions): StreamScrollRefs {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /** Whether the viewport should keep tracking the newest content. */
  const followingRef = useRef(true);
  /** Whether the current `enabled` run has already re-armed following. */
  const armedRef = useRef(false);

  // A new stream starts pinned to the bottom and resumes following even if the
  // user had scrolled up — they asked for this output, so show it.
  useEffect(() => {
    if (!enabled) {
      armedRef.current = false;
      return;
    }
    if (armedRef.current) return;
    armedRef.current = true;
    followingRef.current = true;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [enabled]);

  // Surface resets (conversation switch, new session) re-arm following too.
  useEffect(() => {
    followingRef.current = true;
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [resetKey]);

  // Re-bind every render: the observed elements are conditionally rendered in
  // places (empty state, folded reasoning block) and must attach when they
  // appear. Streaming renders are cheap enough for this churn.
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container) return;

    const onScroll = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      // User intent: scrolling away from the bottom pauses following, coming
      // back resumes it. Programmatic pins land at distance ~0 (still following).
      followingRef.current = distance <= threshold;
    };
    container.addEventListener("scroll", onScroll, { passive: true });

    let observer: ResizeObserver | null = null;
    if (content) {
      observer = new ResizeObserver(() => {
        if (followingRef.current) container.scrollTop = container.scrollHeight;
      });
      observer.observe(content);
    }

    return () => {
      container.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  });

  return { containerRef, contentRef };
}
