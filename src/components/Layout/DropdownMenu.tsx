import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { LucideIcon } from "lucide-react";

export interface DropdownAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Right-aligned accelerator text, e.g. `Ctrl+Shift+E`. */
  shortcut?: string;
  /** Second line under the label: why an action is unavailable, or what it does. */
  hint?: string;
  disabled?: boolean;
  /** Required whenever `disabled` is set — a greyed button with no reason is a defect. */
  disabledReason?: string;
  danger?: boolean;
  onSelect: () => void;
}

export type DropdownEntry = DropdownAction | { separator: true };

const isSeparator = (entry: DropdownEntry): entry is { separator: true } =>
  (entry as { separator?: boolean }).separator === true;

const PANEL_WIDTH = 224;
const VIEWPORT_MARGIN = 8;
const GAP = 2;

interface DropdownMenuProps {
  /** Accessible name of the trigger; also the default tooltip. */
  label: string;
  icon: LucideIcon;
  entries: DropdownEntry[];
  align?: "start" | "end";
  triggerClassName?: string;
  iconSize?: number;
}

/**
 * The single dropdown implementation in the app.
 *
 * Contract:
 * - a fixed 224px panel, never content-sized
 * - one visual language: groups via `{ separator: true }`, icons left, accelerators right
 * - a disabled item always carries `disabledReason`, rendered as a second line because
 *   Chromium never fires pointer events on a `disabled` control (so `title` alone
 *   would never show up)
 * - keyboard: Escape / ArrowUp / ArrowDown / Home / End / Tab, focus returns to the
 *   trigger on Escape
 * - the panel is `position: fixed` and flips above the trigger when the viewport
 *   bottom is too close, so a narrow or short window never clips it. Fixed is safe
 *   here because no ancestor carries `backdrop-filter` (glass lives on
 *   `.surface-glass::before`, see docs/prompt-workspace-shell-glass.md).
 */
export default function DropdownMenu({
  label,
  icon: Icon,
  entries,
  align = "end",
  triggerClassName = "",
  iconSize = 14,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel?.offsetHeight ?? 0;
    const preferredLeft = align === "end" ? rect.right - PANEL_WIDTH : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferredLeft),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
    );
    const below = rect.bottom + GAP;
    const overflowsBelow = below + panelHeight > window.innerHeight - VIEWPORT_MARGIN;
    const above = rect.top - GAP - panelHeight;
    const top = overflowsBelow && above >= VIEWPORT_MARGIN ? above : below;
    setPosition({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // A second pass once the panel has real height: the first paint may not know
    // its own height yet, and the flip decision depends on it.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setPosition(null);
    };
    const onResize = () => close(false);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onResize);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onResize);
    };
  }, [open, close]);

  // Focus the first actionable item so the menu is usable without a mouse.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const items = panelRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      );
      items?.[0]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tab leaves the menu; it must not walk through the items.
        close(false);
        return;
      case "ArrowDown":
        event.preventDefault();
        items[(current + 1 + items.length) % items.length]?.focus();
        return;
      case "ArrowUp":
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        return;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        return;
      case "End":
        event.preventDefault();
        items[items.length - 1]?.focus();
        return;
      default:
    }
  };

  const runAction = (action: DropdownAction) => {
    if (action.disabled) return;
    close(false);
    action.onSelect();
  };

  return (
    <div className="relative flex h-full items-center">
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          if (open) close(false);
          else setOpen(true);
        }}
        className={triggerClassName}
      >
        <Icon size={iconSize} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={handlePanelKeyDown}
          style={{
            position: "fixed",
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: PANEL_WIDTH,
            visibility: position ? "visible" : "hidden",
          }}
          className="z-50 rounded-lg border border-border bg-bg-secondary p-1 shadow-xl shadow-black/20"
        >
          {entries.map((entry, index) =>
            isSeparator(entry) ? (
              <div key={`sep-${index}`} className="my-1 h-px bg-border" aria-hidden="true" />
            ) : (
              <div
                key={entry.id}
                // The wrapper owns the pointer events a disabled button never gets.
                title={entry.disabled ? entry.disabledReason : undefined}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-disabled={entry.disabled || undefined}
                  disabled={entry.disabled}
                  onClick={() => runAction(entry)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    entry.disabled
                      ? "cursor-not-allowed text-text-muted opacity-55"
                      : entry.danger
                        ? "text-danger hover:bg-danger/10"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  }`}
                >
                  {entry.icon && (
                    <entry.icon size={13} strokeWidth={1.9} className="mt-0.5 flex-shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate">{entry.label}</span>
                      {entry.shortcut && (
                        <kbd className="flex-shrink-0 text-[10px] font-normal text-text-muted">
                          {entry.shortcut}
                        </kbd>
                      )}
                    </span>
                    {entry.hint && (
                      <span className="mt-0.5 block text-[10px] leading-4 text-text-muted">
                        {entry.hint}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
