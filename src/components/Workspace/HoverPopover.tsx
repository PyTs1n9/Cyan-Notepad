import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HoverPopoverProps {
  /** Accessible name for both the trigger and the panel. */
  label: string;
  /** Content inside the trigger button (icon, label, count...). */
  trigger: ReactNode;
  triggerClassName?: string;
  /** Width of the panel, in px. Height is measured. */
  panelWidth?: number;
  panelClassName?: string;
  children: ReactNode;
}

const VIEWPORT_PADDING = 8;
const GAP = 6;
/** Long enough to walk from the trigger to the panel across the gap. */
const CLOSE_DELAY = 140;

/**
 * Hover panel anchored to a toolbar button, rendered in a body portal.
 *
 * The collaborative editor's status row is `overflow-hidden` (so a narrow card
 * clips the row instead of spilling it), which would also clip any absolutely
 * positioned panel living inside it - the network chart would simply vanish.
 * Portalling the panel is the only way to keep both: the row clips, the panel
 * floats above the card.
 *
 * Behaviour mirrors the CSS-only version it replaces: opens on hover and on
 * keyboard focus, closes on leave/Escape, and stays open while the pointer
 * travels the 6px gap because closing is deferred.
 */
export default function HoverPopover({
  label,
  trigger,
  triggerClassName = "",
  panelWidth = 288,
  panelClassName = "",
  children,
}: HoverPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const hide = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, CLOSE_DELAY);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const width = panel.offsetWidth || panelWidth;
      const height = panel.offsetHeight;
      // Right-aligned to the button, the way the CSS version was: these panels
      // hang off the right end of the toolbar.
      const left = Math.max(
        VIEWPORT_PADDING,
        Math.min(rect.right - width, window.innerWidth - VIEWPORT_PADDING - width),
      );
      const below = rect.bottom + GAP;
      const fitsBelow = below + height <= window.innerHeight - VIEWPORT_PADDING;
      const top = fitsBelow
        ? below
        : Math.max(VIEWPORT_PADDING, rect.top - GAP - height);
      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, panelWidth]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          onMouseEnter={cancelClose}
          onMouseLeave={hide}
          className={`fixed z-[10002] ${panelClassName}`}
          style={{
            width: panelWidth,
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            // Measured on the first layout pass, so the first frame must not
            // flash at the top-left corner.
            visibility: position ? "visible" : "hidden",
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
