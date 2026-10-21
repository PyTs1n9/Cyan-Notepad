import { lazy, Suspense, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import ActivityBar from "@/components/Layout/ActivityBar";
import SidebarResizeHandle from "@/components/Layout/SidebarResizeHandle";
import {
  SIDEBAR_MIN_WIDTH,
  isBelowSidebarCollapseThreshold,
  resolveSidebarWidth,
} from "@/components/Layout/sidebarLayout";
import TitleBar from "@/components/Layout/TitleBar";
import NoteTabBar from "@/components/Layout/NoteTabBar";
import TodoView from "@/components/Todo/TodoView";
import TodoSidebar from "@/components/Todo/TodoSidebar";
import NoteEditor from "@/components/Editor/NoteEditor";
import CanvasView from "@/components/Canvas/CanvasView";
import SettingsModal from "@/components/Settings/SettingsModal";
import AboutModal from "@/components/Settings/AboutModal";
import UpdateModal from "@/components/Settings/UpdateModal";
import AuthModal from "@/components/Auth/AuthModal";
import PasswordRecoveryModal from "@/components/Auth/PasswordRecoveryModal";
import WorkspaceRemovalNotifier from "@/components/Workspace/WorkspaceRemovalNotifier";
import LoadingText from "@/components/LoadingText";
import { useTodoStore } from "@/stores/todoStore";
import { useNoteStore } from "@/stores/noteStore";
import { useTabStore } from "@/stores/tabStore";
import { useFontStore } from "@/stores/fontStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import type { CustomColors, AppShortcuts, AutoSaveInterval } from "@/stores/settingsStore";
import {
  loadTodos,
  saveTodos,
  loadTodoLists,
  saveTodoLists,
  loadNoteList,
  saveNoteIndex,
  loadSavedFonts,
  saveFontList,
  saveNoteContent,
  loadNoteContent,
  loadSettings,
  saveSettings,
  loadIconData,
  getImageNeedDirectory,
  resolveCustomBackground,
  purgeExpiredNoteTrash,
  loadUiState,
  saveUiState,
} from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { openTileWindow } from "@/utils/tile";
import { applyShortcuts } from "@/utils/shortcutManager";
import { openInDefaultBrowser } from "@/utils/externalLinks";
import { APP_VERSION, fetchLatestRelease, isVersionNewer } from "@/utils/updateChecker";
import type { LatestRelease } from "@/utils/updateChecker";
import { renderStoredNoteContent } from "@/utils/markdown";
import { PASSWORD_RECOVERY_REDIRECT_URL } from "@/utils/supabase";
import { t, tWithParams } from "@/utils/i18n";
import { open, message, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import type { Todo, Note, ViewType } from "@/types";
import TurndownService from "turndown";

const COLLAPSED_WIDTH = 0;
const ACTIVITY_BAR_WIDTH = 48;
const loadWorkspaceView = () => import("@/components/Workspace/WorkspaceView");
const WorkspaceView = lazy(loadWorkspaceView);
type ResizableSidebar = "notebook" | "workspace";
const handledPasswordRecoveryUrls = new Set<string>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isStoredEditorHtml(content: string): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|div|img|hr|br)\b[\s\S]*>/i.test(content);
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  bulletListMarker: "-",
  hr: "---",
});

turndownService.addRule("img", {
  filter: "img",
  replacement: (_content, node) => {
    const el = node as HTMLImageElement;
    const source = el.dataset.attachmentSrc || el.src;
    return `![${el.alt || "image"}](${source})`;
  },
});

function htmlToMarkdown(html: string): string {
  return turndownService
    .turndown(html)
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, "$1");
}

/**
 * Off-screen sheet handed to WebView2's print engine. It lives outside `#root`
 * so the print stylesheet can hide the whole app and leave only the note.
 */
function mountPrintSheet(title: string, html: string): HTMLElement {
  const sheet = document.createElement("article");
  sheet.className = "print-sheet";

  const heading = document.createElement("h1");
  heading.className = "print-sheet-title";
  heading.textContent = title;
  sheet.appendChild(heading);

  const body = document.createElement("div");
  body.className = "print-sheet-body";
  body.innerHTML = html;
  sheet.appendChild(body);

  document.body.appendChild(sheet);
  document.body.classList.add("exporting-pdf");
  return sheet;
}

function unmountPrintSheet(sheet: HTMLElement): void {
  document.body.classList.remove("exporting-pdf");
  sheet.remove();
}

/** PrintToPdf captures the layout as it is now, so wait for paint and images. */
async function waitForPrintLayout(sheet: HTMLElement): Promise<void> {
  for (let frame = 0; frame < 3; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  try {
    await document.fonts.ready;
  } catch {
    // Font loading is best-effort; printing can proceed with fallbacks.
  }
  await Promise.all(
    Array.from(sheet.querySelectorAll("img")).map((image) =>
      image.decode ? image.decode().catch(() => undefined) : Promise.resolve(),
    ),
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("note");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<LatestRelease | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceSidebarWidth, setWorkspaceSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [workspaceSidebarCollapsed, setWorkspaceSidebarCollapsed] = useState(false);
  // Mirrors resizingSidebar as state so the resize handle stays mounted while a
  // drag crosses the collapse threshold (see SIDEBAR_COLLAPSE_THRESHOLD).
  const [resizingSidebarState, setResizingSidebarState] = useState<ResizableSidebar | null>(null);
  // Collapsing must not snap the sidebar away in a single frame. The class is
  // raised in the same commit as the width flip, then dropped once the CSS
  // transition has finished so ordinary dragging stays instant.
  const [collapseAnimating, setCollapseAnimating] = useState(false);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const resizingSidebar = useRef<ResizableSidebar | null>(null);
  const collapseAnimTimer = useRef<number | null>(null);

  const todos = useTodoStore((s) => s.todos);
  const todoLists = useTodoStore((s) => s.lists);
  const activeTodoListId = useTodoStore((s) => s.activeListId);
  const loadTodoData = useTodoStore((s) => s.loadTodoData);

  const notes = useNoteStore((s) => s.notes);
  const categories = useNoteStore((s) => s.categories);
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const activeCategoryId = useNoteStore((s) => s.activeCategoryId);
  const addNote = useNoteStore((s) => s.addNote);
  const loadNotesState = useNoteStore((s) => s.loadNotes);

  const tabs = useTabStore((s) => s.tabs);
  const tabsHydrated = useTabStore((s) => s.hydrated);
  const pruneMissingTabs = useTabStore((s) => s.pruneMissing);
  const restoreTabs = useTabStore((s) => s.restoreTabs);

  const fonts = useFontStore((s) => s.fonts);
  const loadFontsState = useFontStore((s) => s.loadFonts);

  const theme = useSettingsStore((s) => s.theme);
  const lang = useSettingsStore((s) => s.lang);
  const customColors = useSettingsStore((s) => s.customColors);
  const customBackground = useSettingsStore((s) => s.customBackground);
  const savedPresets = useSettingsStore((s) => s.savedPresets);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const stickyOpacity = useSettingsStore((s) => s.stickyOpacity);
  const trashRetentionDays = useSettingsStore((s) => s.trashRetentionDays);
  const showWorkspaceHighlights = useSettingsStore((s) => s.showWorkspaceHighlights);
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
  const updateReminderDisabledForVersion = useSettingsStore((s) => s.updateReminderDisabledForVersion);
  const sidebarCategoryRatio = useSettingsStore((s) => s.sidebarCategoryRatio);
  const expandedFolderIds = useSettingsStore((s) => s.expandedFolderIds);
  const setUpdateReminderDisabledForVersion = useSettingsStore((s) => s.setUpdateReminderDisabledForVersion);
  const loadSettingsState = useSettingsStore((s) => s.loadSettings);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const autoLoginLoading = useAuthStore((s) => s.autoLoginLoading);
  const handlePasswordRecoveryUrl = useAuthStore((s) => s.handlePasswordRecoveryUrl);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: UnlistenFn | null = null;
    const handleUrls = (urls: string[]) => {
      for (const url of urls) {
        if (!url.toLowerCase().startsWith(PASSWORD_RECOVERY_REDIRECT_URL)) continue;
        if (handledPasswordRecoveryUrls.has(url)) continue;
        handledPasswordRecoveryUrls.add(url);
        setAuthOpen(false);
        void handlePasswordRecoveryUrl(url);
      }
    };

    const initializeDeepLinks = async () => {
      const stopListening = await onOpenUrl(handleUrls);
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
      const urls = await getCurrent();
      if (!disposed && urls) handleUrls(urls);
    };

    void initializeDeepLinks()
      .catch((error) => {
        console.error("Failed to initialize password recovery deep links:", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handlePasswordRecoveryUrl]);

  // Warm the lightweight workspace shell after the first render. The heavy
  // collaborative editor is loaded separately only when a document is opened.
  useEffect(() => {
    void loadWorkspaceView();
  }, []);

  // Load data on mount
  useEffect(() => {
    const init = async () => {
      try {
        await getImageNeedDirectory().catch((error) => {
          console.warn("Failed to prepare img-need directory:", error);
          return null;
        });
        const [savedTodos, savedTodoLists, savedNotes, savedFonts, savedSettings, savedUiState] =
          await Promise.all([
            loadTodos<Todo>(),
            loadTodoLists(),
            loadNoteList(),
            loadSavedFonts(),
            loadSettings(),
            loadUiState(),
          ]);
        const savedLang = (savedSettings as { lang?: string }).lang === "en" ? "en" : "zh";
        loadTodoData(savedTodos, savedTodoLists, t(savedLang, "defaultTodoList"));
        if (savedNotes.notes.length > 0 || savedNotes.categories.length > 0) {
          loadNotesState(savedNotes.notes as Note[], savedNotes.categories);
        }
        // Restore the tab strip only from notes that still exist on disk. Preview
        // tabs were never persisted, so every restored tab is a pinned one.
        restoreTabs(
          savedUiState.tabs.map((tab) => tab.id),
          savedUiState.activeId,
          savedNotes.notes.map((note) => note.id),
        );
        if (savedFonts.length > 0) loadFontsState(savedFonts);
        loadSettingsState(savedSettings as {
          theme?: "dark" | "blue" | "yellow" | "green" | "custom";
          lang?: "zh" | "en";
          customColors?: CustomColors | null;
          customBackground?: string | null;
          savedPresets?: { name: string; colors: CustomColors }[];
          shortcuts?: AppShortcuts;
          autoSaveInterval?: AutoSaveInterval;
          stickyOpacity?: number;
          trashRetentionDays?: number;
          showWorkspaceHighlights?: boolean;
          alwaysOnTop?: boolean;
          updateReminderDisabledForVersion?: string | null;
          sidebarCategoryRatio?: number | null;
          expandedFolderIds?: string[] | null;
        });

        // Drop recycle-bin entries that outlived the configured retention window.
        await purgeExpiredNoteTrash();

        // Load custom app icon, fallback to default icon
        const iconData = await loadIconData();
        const iconToSet = iconData ?? await (async () => {
          try {
            const res = await fetch('/default-icon.png');
            if (res.ok) return new Uint8Array(await res.arrayBuffer());
          } catch { /* ignore */ }
          return null;
        })();
        if (iconToSet) {
          try {
            await getCurrentWindow().setIcon(iconToSet);
          } catch { /* ignore setIcon errors on unsupported platforms */ }
        }

        savedFonts.forEach((f) => {
          if (f.path) {
            const style = document.createElement("style");
            style.textContent = `@font-face { font-family: '${f.family}'; src: url('${f.path}'); }`;
            document.head.appendChild(style);
          }
        });
        setInitialized(true);
      } catch (e) {
        console.error("Init failed:", e);
      }
    };
    init();
  }, []); // eslint-disable-line

  // Check the latest GitHub release once after persisted settings are loaded.
  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;
    const disabledForVersion = useSettingsStore.getState().updateReminderDisabledForVersion;
    if (disabledForVersion && disabledForVersion !== APP_VERSION) {
      useSettingsStore.getState().setUpdateReminderDisabledForVersion(null);
    }

    fetchLatestRelease()
      .then((release) => {
        if (
          !cancelled
          && disabledForVersion !== APP_VERSION
          && isVersionNewer(release.version, APP_VERSION)
        ) {
          setAvailableUpdate(release);
        }
      })
      .catch((error) => {
        console.warn("Automatic update check failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [initialized]);

  // Keep the tab strip in step with the note list: a deleted note drops its tab,
  // and any note opened through a non-tab entry point (new note button, tray,
  // global shortcut) joins the strip instead of opening invisibly.
  useEffect(() => {
    if (!tabsHydrated) return;
    pruneMissingTabs(notes.map((note) => note.id));
    if (!activeNoteId) return;
    if (!notes.some((note) => note.id === activeNoteId)) return;
    if (tabs.some((tab) => tab.id === activeNoteId)) return;
    useTabStore.getState().openTab(activeNoteId, { preview: false });
  }, [notes, activeNoteId, tabs, tabsHydrated, pruneMissingTabs]);

  // Persist the session. Preview tabs are deliberately excluded: they represent
  // a note the user merely glanced at, not one they committed to.
  useEffect(() => {
    if (!tabsHydrated) return;
    const timer = window.setTimeout(() => {
      const pinnedIds = tabs.filter((tab) => !tab.preview).map((tab) => tab.id);
      void saveUiState({
        tabs: pinnedIds.map((id) => ({ id })),
        activeId: activeNoteId && pinnedIds.includes(activeNoteId) ? activeNoteId : null,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tabs, activeNoteId, tabsHydrated]);

  // Apply theme class to document
  useEffect(() => {
    applyTheme(theme, customColors);
  }, [theme, customColors]);

  useEffect(() => {
    if (!initialized) return;
    void getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch((error) => {
      console.error("Failed to update always-on-top state:", error);
    });
  }, [alwaysOnTop, initialized]);

  useEffect(() => {
    let cancelled = false;
    if (!customBackground) {
      setCustomBackgroundUrl(null);
      return;
    }
    resolveCustomBackground(customBackground)
      .then((path) => {
        if (!cancelled) setCustomBackgroundUrl(path ? convertFileSrc(path) : null);
      })
      .catch((error) => {
        console.error("Failed to resolve custom background:", error);
        if (!cancelled) setCustomBackgroundUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customBackground]);

  // Auto-save settings
  useEffect(() => {
    if (initialized) {
      saveSettings({
        theme,
        lang,
        customColors,
        customBackground,
        savedPresets,
        shortcuts,
        autoSaveInterval,
        stickyOpacity,
        trashRetentionDays,
        showWorkspaceHighlights,
        alwaysOnTop,
        updateReminderDisabledForVersion,
        sidebarCategoryRatio,
        expandedFolderIds,
      });
    }
  }, [
    theme,
    lang,
    customColors,
    customBackground,
    savedPresets,
    shortcuts,
    autoSaveInterval,
    stickyOpacity,
    trashRetentionDays,
    showWorkspaceHighlights,
    alwaysOnTop,
    updateReminderDisabledForVersion,
    sidebarCategoryRatio,
    expandedFolderIds,
    initialized,
  ]);

  // Purging on change keeps a shortened retention window immediately effective.
  useEffect(() => {
    if (initialized) void purgeExpiredNoteTrash();
  }, [trashRetentionDays, initialized]);

  // Auto-save todos
  useEffect(() => {
    if (initialized) saveTodos(todos);
  }, [todos, initialized]);

  useEffect(() => {
    if (initialized) saveTodoLists({ lists: todoLists, activeListId: activeTodoListId });
  }, [todoLists, activeTodoListId, initialized]);

  // Auto-save note index
  useEffect(() => {
    if (initialized) {
      const index = notes.map(({ id, title, tags, categoryId, pinned, order, createdAt, updatedAt }) => ({
        id, title, tags, categoryId, pinned, order, createdAt, updatedAt,
      }));
      saveNoteIndex(index, categories);
    }
  }, [notes, categories, initialized]);

  // Auto-save fonts
  useEffect(() => {
    if (initialized) {
      const customFonts = fonts.filter((f) => f.path !== "");
      saveFontList(customFonts);
    }
  }, [fonts, initialized]);

  // Listen for pin-current-note shortcut from Rust backend
  useEffect(() => {
    const unlisten = listen("pin-current-note", () => {
      const currentNoteId = useNoteStore.getState().activeNoteId;
      if (currentNoteId) {
        openTileWindow(currentNoteId);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Apply global shortcuts (re-register when shortcuts change)
  useEffect(() => {
    if (initialized) {
      applyShortcuts(shortcuts);
    }
  }, [shortcuts, initialized]);

  // Ctrl+W closes the active note tab.
  //
  // This is a window-scoped keydown listener on purpose. `shortcutManager`
  // registers through @tauri-apps/plugin-global-shortcut, which is system-wide:
  // routing Ctrl+W there would take the combination away from every other
  // application on the machine.
  useEffect(() => {
    // The tab strip only exists in the note view; closing a note tab while the
    // user is looking at the todo list or the canvas would be an invisible edit.
    if (currentView !== "note") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isCloseShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "w" || event.code === "KeyW");
      if (!isCloseShortcut) return;

      // Browsers ignore auto-repeat for tab closing; honouring it here would
      // walk the strip and close every tab while the key is held down.
      if (event.repeat) return;
      // Never interrupt an active IME composition.
      if (event.isComposing) return;

      event.preventDefault();

      // A dialog or an open tab menu owns the keystroke. Closing the note
      // behind it would leave the popup pointing at a tab that is gone.
      if (document.querySelector('[aria-modal="true"], [data-shortcut-blocker]')) return;

      // One rule, no last-tab exception: closing the final tab leaves the
      // documented empty state instead of hiding the window.
      const { activeNoteId } = useNoteStore.getState();
      if (activeNoteId) useTabStore.getState().closeTab(activeNoteId);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [currentView]);

  // Sync theme to tile windows when it changes
  useEffect(() => {
    if (initialized) {
      emit("tile-theme-sync", { theme, customColors });
      emit("sticky:appearance-updated", { theme, customColors, stickyOpacity });
    }
  }, [theme, customColors, stickyOpacity, initialized]);

  // Keep every sidebar above the shared minimum without overriding a wider user-set width.
  useEffect(() => {
    if (!initialized) return;
    setSidebarWidth((currentWidth) => Math.max(currentWidth, SIDEBAR_MIN_WIDTH));
    setWorkspaceSidebarWidth((currentWidth) => Math.max(currentWidth, SIDEBAR_MIN_WIDTH));
  }, [lang, initialized]);

  // Sidebar resize drag
  const rafId = useRef<number | null>(null);
  const latestSidebarWidth = useRef(SIDEBAR_MIN_WIDTH);
  const latestSidebarCollapsed = useRef(false);

  const setSidebarCollapsedState = useCallback((sidebar: ResizableSidebar, collapsed: boolean) => {
    if (sidebar === "workspace") {
      setWorkspaceSidebarCollapsed(collapsed);
    } else {
      setSidebarCollapsed(collapsed);
    }
  }, []);

  // Enable the width transition for one collapse/expand cycle, then turn it off
  // again so the next ordinary drag tracks the pointer without easing.
  const pulseCollapseAnim = useCallback(() => {
    setCollapseAnimating(true);
    if (collapseAnimTimer.current !== null) {
      window.clearTimeout(collapseAnimTimer.current);
    }
    collapseAnimTimer.current = window.setTimeout(() => {
      collapseAnimTimer.current = null;
      setCollapseAnimating(false);
    }, 240);
  }, []);

  useEffect(() => () => {
    if (collapseAnimTimer.current !== null) window.clearTimeout(collapseAnimTimer.current);
  }, []);

  const handleSidebarPointerDown = useCallback((sidebar: ResizableSidebar) => {
    resizingSidebar.current = sidebar;
    setResizingSidebarState(sidebar);
    latestSidebarCollapsed.current = sidebar === "workspace"
      ? workspaceSidebarCollapsed
      : sidebarCollapsed;
    latestSidebarWidth.current = sidebar === "workspace" ? workspaceSidebarWidth : sidebarWidth;
    appRootRef.current?.classList.add("sidebar-resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarCollapsed, sidebarWidth, workspaceSidebarCollapsed, workspaceSidebarWidth]);

  useEffect(() => {
    const sidebarProperty = (sidebar: ResizableSidebar) =>
      sidebar === "workspace" ? "--workspace-sidebar-width" : "--notebook-sidebar-width";

    const applyWidth = () => {
      rafId.current = null;
      const sidebar = resizingSidebar.current;
      if (!sidebar) return;
      appRootRef.current?.style.setProperty(
        sidebarProperty(sidebar),
        `${latestSidebarWidth.current}px`,
      );
    };

    const syncCollapsed = (sidebar: ResizableSidebar, collapsed: boolean) => {
      latestSidebarCollapsed.current = collapsed;
      pulseCollapseAnim();
      setSidebarCollapsedState(sidebar, collapsed);
      // The shell width is state-driven, so expanding mid-drag would first paint
      // the previous width. Pin the preview width before that render lands.
      if (!collapsed) {
        appRootRef.current?.style.setProperty(
          sidebarProperty(sidebar),
          `${latestSidebarWidth.current}px`,
        );
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const sidebar = resizingSidebar.current;
      if (!sidebar) return;
      if (isBelowSidebarCollapseThreshold(event.clientX, ACTIVITY_BAR_WIDTH)) {
        // Collapse as soon as the drag crosses the threshold. The stored width is
        // left untouched so expanding returns to the last usable width.
        if (!latestSidebarCollapsed.current) syncCollapsed(sidebar, true);
        return;
      }
      latestSidebarWidth.current = resolveSidebarWidth(event.clientX, ACTIVITY_BAR_WIDTH);
      if (latestSidebarCollapsed.current) syncCollapsed(sidebar, false);
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(applyWidth);
      }
    };

    const finishResize = (pointerX?: number) => {
      const sidebar = resizingSidebar.current;
      if (!sidebar) return;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      const collapsed = pointerX === undefined
        ? latestSidebarCollapsed.current
        : isBelowSidebarCollapseThreshold(pointerX, ACTIVITY_BAR_WIDTH);
      if (pointerX !== undefined && !collapsed) {
        latestSidebarWidth.current = resolveSidebarWidth(pointerX, ACTIVITY_BAR_WIDTH);
      }
      const width = latestSidebarWidth.current;
      appRootRef.current?.style.setProperty(sidebarProperty(sidebar), `${width}px`);
      resizingSidebar.current = null;
      setResizingSidebarState(null);
      // A quick flick can flip the state on release instead of during the drag.
      if (collapsed !== latestSidebarCollapsed.current) pulseCollapseAnim();
      setSidebarCollapsedState(sidebar, collapsed);
      // A collapsed release must not lower the stored width, otherwise expanding
      // would snap back to the minimum instead of the width the user had chosen.
      if (!collapsed) {
        if (sidebar === "workspace") {
          setWorkspaceSidebarWidth(width);
        } else {
          setSidebarWidth(width);
        }
      }
      latestSidebarCollapsed.current = collapsed;
      appRootRef.current?.classList.remove("sidebar-resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishResize(event.clientX);
    };
    const cancelResize = () => finishResize();
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelResize);
    window.addEventListener("blur", cancelResize);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelResize);
      window.removeEventListener("blur", cancelResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [pulseCollapseAnim, setSidebarCollapsedState]);

  const handleNewNote = (categoryId?: string | null) => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      content: "",
      tags: [],
      // An explicit folder (from the tree context menu) wins over the selection.
      categoryId: categoryId === undefined ? activeCategoryId : categoryId,
      pinned: false,
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    addNote(note);
    saveNoteContent(note.id, "");
  };

  const createImportedNote = useCallback(async (filePath: string, content: string, savedContent: string) => {
    const fileName = filePath.split(/[\\/]/).pop() || "imported";
    const title = fileName.replace(/\.(md|markdown|txt)$/i, "");
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title,
      content: savedContent,
      tags: [],
      categoryId: activeCategoryId,
      pinned: false,
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    await saveNoteContent(note.id, savedContent);
    console.log("[import] saved", fileName, "raw length:", content.length, "id:", note.id);
    addNote(note);
  }, [activeCategoryId, addNote]);

  // Import Markdown and Text files in one picker
  const handleImportTextNotes = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Markdown / Text", extensions: ["md", "markdown", "txt"] }],
        multiple: true,
      });
      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];
      for (const filePath of files) {
        const content = await readTextFile(filePath);
        const isTextFile = /\.txt$/i.test(filePath);
        const savedContent = isTextFile
          ? content
            .split(/\n/)
            .map((line) => line ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>")
            .join("\n")
          : content;
        await createImportedNote(filePath, content, savedContent);
      }
      setCurrentView("note");
    } catch (e) {
      console.error("Failed to import text notes:", e);
    }
  }, [createImportedNote]);

  const handleExportActiveNote = useCallback(async () => {
    if (!activeNoteId) return;
    const activeNote = notes.find((note) => note.id === activeNoteId);
    if (!activeNote) return;

    try {
      const defaultPath = `${activeNote.title || t(lang, "untitled")}.md`;
      const savePath = await save({
        filters: [
          { name: t(lang, "exportFilterMarkdown"), extensions: ["md"] },
          { name: t(lang, "exportFilterText"), extensions: ["txt"] },
          { name: t(lang, "exportFilterWord"), extensions: ["docx"] },
          { name: t(lang, "exportFilterPdf"), extensions: ["pdf"] },
        ],
        defaultPath,
      });
      if (!savePath) return;

      // Windows only appends the first filter's extension, so a name typed
      // without one after picking Word or PDF would otherwise land on `.md`.
      const hasExtension = /\.[^./\\]+$/.test(savePath);
      const exportPath = hasExtension ? savePath : `${savePath}.md`;

      const storedContent = Object.prototype.hasOwnProperty.call(activeNote, "content")
        ? activeNote.content
        : await loadNoteContent(activeNote.id);
      const target = exportPath.toLowerCase();

      // Word and PDF both need the rendered form: images resolved to data URLs,
      // code blocks highlighted, Markdown already parsed.
      if (target.endsWith(".docx") || target.endsWith(".pdf")) {
        const html = await renderStoredNoteContent(storedContent);

        if (target.endsWith(".docx")) {
          // The DOCX writer is only pulled in when someone actually exports
          // Word, which keeps it out of the startup bundle.
          const { buildNoteDocx } = await import("@/utils/exportDocx");
          const { data, droppedImages } = await buildNoteDocx({
            title: activeNote.title,
            html,
          });
          await writeFile(exportPath, data);
          if (droppedImages > 0) {
            await message(tWithParams(lang, "exportImagesDropped", { count: droppedImages }), {
              title: t(lang, "exportFile"),
              kind: "warning",
            });
          }
          return;
        }

        const sheet = mountPrintSheet(activeNote.title || t(lang, "untitled"), html);
        try {
          await waitForPrintLayout(sheet);
          await invoke("export_pdf", { path: exportPath });
        } finally {
          unmountPrintSheet(sheet);
        }
        return;
      }

      const exportContent = isStoredEditorHtml(storedContent)
        ? htmlToMarkdown(storedContent)
        : storedContent;
      await writeTextFile(exportPath, exportContent);
    } catch (e) {
      console.error("Export file failed:", e);
      const detail = e instanceof Error ? e.message : String(e);
      void message(tWithParams(lang, "exportFailed", { message: detail }), {
        title: t(lang, "exportFile"),
        kind: "error",
      }).catch(() => undefined);
    }
  }, [activeNoteId, lang, notes]);

  const activeSidebarCollapsed = currentView === "workspace"
    ? workspaceSidebarCollapsed
    : sidebarCollapsed;

  const toggleActiveSidebar = () => {
    if (currentView === "workspace") {
      setWorkspaceSidebarCollapsed((collapsed) => !collapsed);
      return;
    }
    setSidebarCollapsed((collapsed) => !collapsed);
  };

  const handleUpdateNow = useCallback(async () => {
    if (!availableUpdate) return;
    try {
      const opened = await openInDefaultBrowser(availableUpdate.url);
      if (opened) setAvailableUpdate(null);
    } catch (error) {
      console.error("Failed to open update page:", error);
    }
  }, [availableUpdate]);

  const handleNeverRemindUpdate = useCallback(() => {
    setUpdateReminderDisabledForVersion(APP_VERSION);
    setAvailableUpdate(null);
  }, [setUpdateReminderDisabledForVersion]);

  const appStyle = {
    "--notebook-sidebar-width": `${sidebarWidth}px`,
    "--workspace-sidebar-width": `${workspaceSidebarWidth}px`,
    ...(customBackgroundUrl ? {
      backgroundImage: `linear-gradient(color-mix(in srgb, var(--color-bg-primary) 34%, transparent), color-mix(in srgb, var(--color-bg-primary) 34%, transparent)), url(${JSON.stringify(customBackgroundUrl)})`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    } : {}),
  } as CSSProperties;

  return (
    <div
      ref={appRootRef}
      className={`flex flex-col h-screen w-screen overflow-hidden bg-bg-primary ${customBackgroundUrl ? "app-has-custom-background" : ""}`}
      style={appStyle}
    >
      {/* Custom Title Bar */}
      <TitleBar
        currentView={currentView}
        onViewChange={setCurrentView}
        onNewNote={handleNewNote}
        onImportTextNotes={handleImportTextNotes}
        onExportActiveNote={handleExportActiveNote}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar
          currentView={currentView}
          onViewChange={setCurrentView}
          onOpenSettings={() => setSettingsOpen(true)}
          collapsed={activeSidebarCollapsed}
          onToggleCollapse={toggleActiveSidebar}
        />
        {currentView !== "workspace" && currentView !== "canvas" && (
          <>
            <div
              style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : "var(--notebook-sidebar-width)" }}
              className={`sidebar-width-shell h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out${collapseAnimating ? " sidebar-collapse-anim" : ""}`}
            >
              {currentView === "todo" ? (
                <TodoSidebar  />
              ) : (
                <Sidebar
                  currentView={currentView}
                  onViewChange={setCurrentView}
                  onNewNote={handleNewNote}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              )}
            </div>
            {/* Resize Handle. Kept mounted while dragging so the collapse that
                happens mid-drag does not remove the element holding the pointer. */}
            {(!sidebarCollapsed || resizingSidebarState === "notebook") && (
              <SidebarResizeHandle onPointerDown={() => handleSidebarPointerDown("notebook")} />
            )}
          </>
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {currentView === "todo"
            ? <TodoView />
            : currentView === "workspace"
              ? (
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-text-muted"><LoadingText label={t(lang, "authWorking")} /></div>}>
                  <WorkspaceView
                    sidebarCollapsed={workspaceSidebarCollapsed}
                    sidebarResizing={resizingSidebarState === "workspace"}
                    sidebarCollapseAnimating={collapseAnimating}
                    onSidebarResizeStart={() => handleSidebarPointerDown("workspace")}
                    onOpenAuth={() => setAuthOpen(true)}
                  />
                </Suspense>
              )
              : currentView === "canvas"
                ? <CanvasView />
                : (
                  <>
                    <NoteTabBar />
                    {/* The editor keeps a `h-full` root, so it needs a sized
                        parent once the tab strip shares the column with it. */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                      <NoteEditor />
                    </div>
                  </>
                )}
        </main>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenAuth={() => setAuthOpen(true)}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {availableUpdate && (
        <UpdateModal
          currentVersion={APP_VERSION}
          latestVersion={availableUpdate.version}
          onUpdateNow={handleUpdateNow}
          onUpdateLater={() => setAvailableUpdate(null)}
          onNeverRemind={handleNeverRemindUpdate}
        />
      )}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <PasswordRecoveryModal />
      <WorkspaceRemovalNotifier />
      {autoLoginLoading && (
        <div className="pointer-events-none fixed inset-x-0 top-12 z-[100] flex justify-center px-4">
          <div
            className="rounded-lg border border-border bg-bg-secondary/95 px-4 py-2 text-sm font-medium text-text-primary shadow-lg backdrop-blur-sm"
            role="status"
          >
            <LoadingText label={t(lang, "authAutoSigningIn")} variant="bounce" />
          </div>
        </div>
      )}
    </div>
  );
}
