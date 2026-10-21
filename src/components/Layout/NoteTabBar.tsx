import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { ChevronLeft, ChevronRight, FileText, Pin, X } from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useTabStore, type TabDropPosition } from "@/stores/tabStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

interface TabContextMenuState {
  noteId: string;
  x: number;
  y: number;
}

interface DropIndicator {
  noteId: string;
  position: TabDropPosition;
}

const TAB_MIN_WIDTH = 96;
const TAB_MAX_WIDTH = 208;

/**
 * Browser-style tab strip for open notes.
 *
 * Interaction contract (see docs/decisions-note-tabs.md):
 * - single click in the sidebar opens a preview tab that the next single click replaces
 * - double click, or the context menu, pins it
 * - the close affordance turns into an unsaved dot while the note is dirty
 */
const NoteTabBar = () => {
  const lang = useSettingsStore((s) => s.lang);
  const notes = useNoteStore((s) => s.notes);
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const setActiveNoteId = useNoteStore((s) => s.setActiveNoteId);
  const tabs = useTabStore((s) => s.tabs);
  const dirtyIds = useTabStore((s) => s.dirtyIds);
  const pinTab = useTabStore((s) => s.pinTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);
  const moveTab = useTabStore((s) => s.moveTab);

  const stripRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<TabContextMenuState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => noteById.has(tab.id)),
    [tabs, noteById],
  );

  const getTitle = (noteId: string) => {
    const title = noteById.get(noteId)?.title.trim();
    return title || t(lang, "untitled");
  };

  // Keep the active tab inside the visible part of the strip without moving
  // the whole window: only the strip scrolls.
  useEffect(() => {
    if (!activeNoteId) return;
    const element = stripRef.current?.querySelector<HTMLElement>(
      `[data-note-tab="${CSS.escape(activeNoteId)}"]`,
    );
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeNoteId, visibleTabs.length]);

  // A plain wheel over the strip would do nothing: Chromium never maps vertical
  // wheel deltas onto a horizontally scrolling container, and the scrollbar is
  // hidden to keep the 36px bar clean. Map the wheel manually so the usual
  // gesture works, and let the chevrons cover trackpads and mice without one.
  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      element.scrollLeft += delta;
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  const syncScrollEdges = useCallback(() => {
    const element = stripRef.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const next = { left: element.scrollLeft > 1, right: element.scrollLeft < max - 1 };
    setCanScroll((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  // Re-measure on resize, on scroll and whenever the tab count changes.
  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;
    syncScrollEdges();
    const observer = new ResizeObserver(syncScrollEdges);
    observer.observe(element);
    element.addEventListener("scroll", syncScrollEdges, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", syncScrollEdges);
    };
  }, [syncScrollEdges, visibleTabs.length]);

  const nudgeStrip = (direction: -1 | 1) => {
    const element = stripRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(160, element.clientWidth * 0.6),
      behavior: "smooth",
    });
  };

  // Dismiss the context menu on any outside interaction, scroll, Escape or the
  // close shortcut. Ctrl+W while the menu is open only dismisses it: the menu is
  // marked as a shortcut blocker, so the tab survives one keystroke.
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCloseShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "w" || event.code === "KeyW");
      if (event.key === "Escape" || isCloseShortcut) setMenu(null);
    };
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  const handleContextMenu = useCallback((event: MouseEvent, noteId: string) => {
    event.preventDefault();
    event.stopPropagation();
    // Keep the menu inside the viewport when the tab strip is scrolled far right.
    const menuWidth = 176;
    const menuHeight = 208;
    setMenu({
      noteId,
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, noteId: string) => {
    if (!draggingId || draggingId === noteId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position: TabDropPosition =
      event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropIndicator((current) =>
      current?.noteId === noteId && current.position === position ? current : { noteId, position },
    );
  }, [draggingId]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      event.preventDefault();
      const position = dropIndicator?.noteId === noteId ? dropIndicator.position : "before";
      if (draggingId && draggingId !== noteId) moveTab(draggingId, noteId, position);
      setDraggingId(null);
      setDropIndicator(null);
    },
    [draggingId, dropIndicator, moveTab],
  );

  if (visibleTabs.length === 0) return null;

  const menuIndex = menu ? visibleTabs.findIndex((tab) => tab.id === menu.noteId) : -1;
  const menuTab = menuIndex >= 0 ? visibleTabs[menuIndex] : null;

  const menuItemClass =
    "flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      className="relative flex h-9 flex-shrink-0 items-stretch border-b border-border bg-bg-secondary"
      role="tablist"
      aria-label={t(lang, "noteTabs")}
    >
      <div
        ref={stripRef}
        className="note-tab-strip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden px-1.5"
      >
        {visibleTabs.map((tab) => {
          const active = tab.id === activeNoteId;
          const dirty = dirtyIds.includes(tab.id);
          const showDropLine = dropIndicator?.noteId === tab.id && draggingId !== tab.id;
          return (
            <div
              key={tab.id}
              data-note-tab={tab.id}
              role="tab"
              aria-selected={active}
              draggable
              onClick={() => setActiveNoteId(tab.id)}
              onDoubleClick={() => pinTab(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  closeTab(tab.id);
                }
              }}
              onContextMenu={(event) => handleContextMenu(event, tab.id)}
              onDragStart={(event) => {
                setDraggingId(tab.id);
                event.dataTransfer.effectAllowed = "move";
                // Firefox/WebView2 both require some payload for the drag to start.
                event.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragOver={(event) => handleDragOver(event, tab.id)}
              onDrop={(event) => handleDrop(event, tab.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDropIndicator(null);
              }}
              title={tab.preview ? t(lang, "previewTabHint") : getTitle(tab.id)}
              style={{ flex: `1 1 ${TAB_MAX_WIDTH}px`, minWidth: TAB_MIN_WIDTH, maxWidth: TAB_MAX_WIDTH }}
              className={`group relative flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-[background-color,color,box-shadow,transform] duration-150 ease-out ${
                draggingId === tab.id ? "scale-[0.98] opacity-40" : ""
              } ${
                active
                  ? "bg-bg-primary text-text-primary shadow-sm ring-1 ring-border/70"
                  : "text-text-muted hover:-translate-y-px hover:bg-bg-hover hover:text-text-secondary hover:shadow-sm hover:ring-1 hover:ring-border/50"
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-0 h-[2px] w-6 -translate-x-1/2 rounded-full bg-accent"
                />
              )}
              {showDropLine && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-accent ${
                    dropIndicator?.position === "after" ? "right-0" : "left-0"
                  }`}
                />
              )}
              <span
                className={`flex-shrink-0 transition-opacity duration-150 ${
                  active ? "text-accent opacity-100" : "opacity-60 group-hover:opacity-100"
                }`}
              >
                {tab.preview ? <FileText size={13} strokeWidth={1.8} /> : <Pin size={12} strokeWidth={1.8} />}
              </span>
              <span className={`min-w-0 flex-1 truncate ${tab.preview ? "italic" : ""}`}>
                {getTitle(tab.id)}
              </span>
              <button
                type="button"
                aria-label={`${dirty ? t(lang, "unsaved") : t(lang, "closeTab")} (Ctrl+W)`}
                title={`${dirty ? t(lang, "unsaved") : t(lang, "closeTab")} (Ctrl+W)`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-bg-active hover:text-text-primary"
              >
                {dirty ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500 group-hover:hidden" aria-hidden="true" />
                    <X size={13} className="hidden group-hover:block" />
                  </>
                ) : (
                  <X
                    size={13}
                    className={active ? "opacity-80" : "opacity-0 group-hover:opacity-80"}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {canScroll.left && (
        <button
          type="button"
          aria-label={t(lang, "scrollTabsLeft")}
          title={t(lang, "scrollTabsLeft")}
          onClick={() => nudgeStrip(-1)}
          className="absolute inset-y-0 left-0 z-10 flex w-6 items-center justify-center bg-gradient-to-r from-bg-secondary via-bg-secondary/85 to-transparent text-text-muted transition-colors hover:text-text-primary"
        >
          <ChevronLeft size={14} strokeWidth={2.2} />
        </button>
      )}
      {canScroll.right && (
        <button
          type="button"
          aria-label={t(lang, "scrollTabsRight")}
          title={t(lang, "scrollTabsRight")}
          onClick={() => nudgeStrip(1)}
          className="absolute inset-y-0 right-0 z-10 flex w-6 items-center justify-center bg-gradient-to-l from-bg-secondary via-bg-secondary/85 to-transparent text-text-muted transition-colors hover:text-text-primary"
        >
          <ChevronRight size={14} strokeWidth={2.2} />
        </button>
      )}

      {menu && menuTab && (
        <div
          className="fixed z-50 w-44 rounded-lg border border-border bg-bg-secondary p-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          data-shortcut-blocker="note-tab-menu"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              closeTab(menuTab.id);
              setMenu(null);
            }}
          >
            {t(lang, "closeTab")}
            <kbd className="text-[10px] font-normal text-text-muted">Ctrl+W</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              closeOtherTabs(menuTab.id);
              setMenu(null);
            }}
          >
            {t(lang, "closeOtherTabs")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={menuIndex === visibleTabs.length - 1}
            className={menuItemClass}
            onClick={() => {
              closeTabsToRight(menuTab.id);
              setMenu(null);
            }}
          >
            {t(lang, "closeTabsToRight")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              closeAllTabs();
              setMenu(null);
            }}
          >
            {t(lang, "closeAllTabs")}
          </button>
          {menuTab.preview && (
            <>
              <div className="my-1 h-px bg-border" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  pinTab(menuTab.id);
                  setMenu(null);
                }}
              >
                {t(lang, "pinTab")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteTabBar;
