import { lazy, Suspense, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import ActivityBar from "@/components/Layout/ActivityBar";
import SidebarResizeHandle from "@/components/Layout/SidebarResizeHandle";
import { SIDEBAR_MIN_WIDTH } from "@/components/Layout/sidebarLayout";
import TitleBar from "@/components/Layout/TitleBar";
import TodoView from "@/components/Todo/TodoView";
import TodoSidebar from "@/components/Todo/TodoSidebar";
import NoteEditor from "@/components/Editor/NoteEditor";
import CanvasView from "@/components/Canvas/CanvasView";
import SettingsModal from "@/components/Settings/SettingsModal";
import AboutModal from "@/components/Settings/AboutModal";
import UpdateModal from "@/components/Settings/UpdateModal";
import AuthModal from "@/components/Auth/AuthModal";
import WorkspaceRemovalNotifier from "@/components/Workspace/WorkspaceRemovalNotifier";
import LoadingText from "@/components/LoadingText";
import { useTodoStore } from "@/stores/todoStore";
import { useNoteStore } from "@/stores/noteStore";
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
} from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { openTileWindow } from "@/utils/tile";
import { applyShortcuts } from "@/utils/shortcutManager";
import { openInDefaultBrowser } from "@/utils/externalLinks";
import { APP_VERSION, fetchLatestRelease, isVersionNewer } from "@/utils/updateChecker";
import type { LatestRelease } from "@/utils/updateChecker";
import { t } from "@/utils/i18n";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import type { Todo, Note, ViewType } from "@/types";
import TurndownService from "turndown";

const MAX_SIDEBAR = 400;
const COLLAPSED_WIDTH = 0;
const ACTIVITY_BAR_WIDTH = 48;
const loadWorkspaceView = () => import("@/components/Workspace/WorkspaceView");
const WorkspaceView = lazy(loadWorkspaceView);
type ResizableSidebar = "notebook" | "workspace";

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

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("todo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<LatestRelease | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceSidebarWidth, setWorkspaceSidebarWidth] = useState(SIDEBAR_MIN_WIDTH);
  const [workspaceSidebarCollapsed, setWorkspaceSidebarCollapsed] = useState(false);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const appRootRef = useRef<HTMLDivElement>(null);
  const resizingSidebar = useRef<ResizableSidebar | null>(null);

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
  const showWorkspaceHighlights = useSettingsStore((s) => s.showWorkspaceHighlights);
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
  const updateReminderDisabledForVersion = useSettingsStore((s) => s.updateReminderDisabledForVersion);
  const setUpdateReminderDisabledForVersion = useSettingsStore((s) => s.setUpdateReminderDisabledForVersion);
  const loadSettingsState = useSettingsStore((s) => s.loadSettings);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const autoLoginLoading = useAuthStore((s) => s.autoLoginLoading);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

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
        const [savedTodos, savedTodoLists, savedNotes, savedFonts, savedSettings] = await Promise.all([
          loadTodos<Todo>(),
          loadTodoLists(),
          loadNoteList(),
          loadSavedFonts(),
          loadSettings(),
        ]);
        const savedLang = (savedSettings as { lang?: string }).lang === "en" ? "en" : "zh";
        loadTodoData(savedTodos, savedTodoLists, t(savedLang, "defaultTodoList"));
        if (savedNotes.notes.length > 0 || savedNotes.categories.length > 0) {
          loadNotesState(savedNotes.notes as Note[], savedNotes.categories);
        }
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
          showWorkspaceHighlights?: boolean;
          alwaysOnTop?: boolean;
          updateReminderDisabledForVersion?: string | null;
        });

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
        showWorkspaceHighlights,
        alwaysOnTop,
        updateReminderDisabledForVersion,
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
    showWorkspaceHighlights,
    alwaysOnTop,
    updateReminderDisabledForVersion,
    initialized,
  ]);

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

  const handleSidebarPointerDown = useCallback((sidebar: ResizableSidebar) => {
    resizingSidebar.current = sidebar;
    latestSidebarWidth.current = sidebar === "workspace" ? workspaceSidebarWidth : sidebarWidth;
    appRootRef.current?.classList.add("sidebar-resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth, workspaceSidebarWidth]);

  useEffect(() => {
    const applyWidth = () => {
      rafId.current = null;
      const sidebar = resizingSidebar.current;
      if (!sidebar) return;
      const property = sidebar === "workspace" ? "--workspace-sidebar-width" : "--notebook-sidebar-width";
      appRootRef.current?.style.setProperty(property, `${latestSidebarWidth.current}px`);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizingSidebar.current) return;
      latestSidebarWidth.current = Math.min(
        MAX_SIDEBAR,
        Math.max(SIDEBAR_MIN_WIDTH, event.clientX - ACTIVITY_BAR_WIDTH),
      );
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(applyWidth);
      }
    };
    const finishResize = () => {
      const sidebar = resizingSidebar.current;
      if (!sidebar) return;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      const width = latestSidebarWidth.current;
      const property = sidebar === "workspace" ? "--workspace-sidebar-width" : "--notebook-sidebar-width";
      appRootRef.current?.style.setProperty(property, `${width}px`);
      resizingSidebar.current = null;
      if (sidebar === "workspace") {
        setWorkspaceSidebarWidth(width);
      } else {
        setSidebarWidth(width);
      }
      appRootRef.current?.classList.remove("sidebar-resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (resizingSidebar.current) {
        latestSidebarWidth.current = Math.min(
          MAX_SIDEBAR,
          Math.max(SIDEBAR_MIN_WIDTH, event.clientX - ACTIVITY_BAR_WIDTH),
        );
      }
      finishResize();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", finishResize);
    window.addEventListener("blur", finishResize);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleNewNote = () => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      content: "",
      tags: [],
      categoryId: activeCategoryId,
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
          { name: "Markdown", extensions: ["md"] },
          { name: "Text", extensions: ["txt"] },
        ],
        defaultPath,
      });
      if (!savePath) return;

      const storedContent = Object.prototype.hasOwnProperty.call(activeNote, "content")
        ? activeNote.content
        : await loadNoteContent(activeNote.id);
      const exportContent = isStoredEditorHtml(storedContent)
        ? htmlToMarkdown(storedContent)
        : storedContent;
      await writeTextFile(savePath, exportContent);
    } catch (e) {
      console.error("Export file failed:", e);
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
      <div className="flex flex-1 overflow-hidden">
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
              className="sidebar-width-shell h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
            >
              {currentView === "todo" ? (
                <TodoSidebar />
              ) : (
                <Sidebar
                  currentView={currentView}
                  onViewChange={setCurrentView}
                  onNewNote={handleNewNote}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
              )}
            </div>
            {/* Resize Handle */}
            {!sidebarCollapsed && (
              <SidebarResizeHandle onPointerDown={() => handleSidebarPointerDown("notebook")} />
            )}
          </>
        )}
        <main className="flex-1 flex flex-col overflow-hidden">
          {currentView === "todo"
            ? <TodoView />
            : currentView === "workspace"
              ? (
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-text-muted"><LoadingText label={t(lang, "authWorking")} /></div>}>
                  <WorkspaceView
                    sidebarCollapsed={workspaceSidebarCollapsed}
                    onSidebarResizeStart={() => handleSidebarPointerDown("workspace")}
                    onOpenAuth={() => setAuthOpen(true)}
                  />
                </Suspense>
              )
              : currentView === "canvas"
                ? <CanvasView />
                : <NoteEditor />}
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
