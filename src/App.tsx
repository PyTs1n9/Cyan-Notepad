import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import ActivityBar from "@/components/Layout/ActivityBar";
import { SIDEBAR_LABEL_MIN_WIDTH } from "@/components/Layout/sidebarLayout";
import TitleBar from "@/components/Layout/TitleBar";
import TodoView from "@/components/Todo/TodoView";
import NoteEditor from "@/components/Editor/NoteEditor";
import SettingsModal from "@/components/Settings/SettingsModal";
import AboutModal from "@/components/Settings/AboutModal";
import AuthModal from "@/components/Auth/AuthModal";
import { useTodoStore } from "@/stores/todoStore";
import { useNoteStore } from "@/stores/noteStore";
import { useFontStore } from "@/stores/fontStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import type { CustomColors, AppShortcuts, AutoSaveInterval } from "@/stores/settingsStore";
import {
  loadTodos,
  saveTodos,
  loadNoteList,
  saveNoteIndex,
  loadSavedFonts,
  saveFontList,
  saveNoteContent,
  loadNoteContent,
  loadSettings,
  saveSettings,
  loadIconData,
} from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { openTileWindow } from "@/utils/tile";
import { applyShortcuts } from "@/utils/shortcutManager";
import { t } from "@/utils/i18n";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emit } from "@tauri-apps/api/event";
import type { Todo, Note, ViewType } from "@/types";
import TurndownService from "turndown";

const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 400;
const COLLAPSED_WIDTH = 0;
const ACTIVITY_BAR_WIDTH = 48;
const WorkspaceView = lazy(() => import("@/components/Workspace/WorkspaceView"));

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
  const [initialized, setInitialized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDragging = useRef(false);

  const todos = useTodoStore((s) => s.todos);
  const loadTodosState = useTodoStore((s) => s.loadTodos);

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
  const savedPresets = useSettingsStore((s) => s.savedPresets);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const stickyOpacity = useSettingsStore((s) => s.stickyOpacity);
  const loadSettingsState = useSettingsStore((s) => s.loadSettings);
  const initializeAuth = useAuthStore((s) => s.initialize);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  // Load data on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [savedTodos, savedNotes, savedFonts, savedSettings] = await Promise.all([
          loadTodos<Todo>(),
          loadNoteList(),
          loadSavedFonts(),
          loadSettings(),
        ]);
        if (savedTodos.length > 0) loadTodosState(savedTodos);
        if (savedNotes.notes.length > 0 || savedNotes.categories.length > 0) {
          loadNotesState(savedNotes.notes as Note[], savedNotes.categories);
        }
        if (savedFonts.length > 0) loadFontsState(savedFonts);
        loadSettingsState(savedSettings as {
          theme?: "dark" | "blue" | "yellow" | "green" | "custom";
          lang?: "zh" | "en";
          customColors?: CustomColors | null;
          savedPresets?: { name: string; colors: CustomColors }[];
          shortcuts?: AppShortcuts;
          autoSaveInterval?: AutoSaveInterval;
          stickyOpacity?: number;
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
      } catch (e) {
        console.error("Init failed:", e);
      }
      setInitialized(true);
    };
    init();
  }, []); // eslint-disable-line

  // Apply theme class to document
  useEffect(() => {
    applyTheme(theme, customColors);
  }, [theme, customColors]);

  // Auto-save settings
  useEffect(() => {
    if (initialized) {
      saveSettings({ theme, lang, customColors, savedPresets, shortcuts, autoSaveInterval, stickyOpacity });
    }
  }, [theme, lang, customColors, savedPresets, shortcuts, autoSaveInterval, stickyOpacity, initialized]);

  // Auto-save todos
  useEffect(() => {
    if (initialized) saveTodos(todos);
  }, [todos, initialized]);

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

  // Keep translated sidebar actions readable without overriding a wider user-set width.
  useEffect(() => {
    if (!initialized) return;
    setSidebarWidth((currentWidth) => Math.max(currentWidth, SIDEBAR_LABEL_MIN_WIDTH[lang]));
  }, [lang, initialized]);

  // Sidebar resize drag
  const rafId = useRef<number | null>(null);
  const latestX = useRef(0);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const applyWidth = () => {
      rafId.current = null;
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, latestX.current));
      setSidebarWidth(newWidth);
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      latestX.current = e.clientX - ACTIVITY_BAR_WIDTH;
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(applyWidth);
      }
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
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
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth }} className="h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out">
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            onNewNote={handleNewNote}
            onImportTextNotes={handleImportTextNotes}
            onExportActiveNote={handleExportActiveNote}
            collapsed={sidebarCollapsed}
            width={sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
        {/* Resize Handle */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1 h-full cursor-col-resize hover:bg-blue-200 active:bg-blue-300
              transition-colors flex-shrink-0 bg-accent"
          />
        )}
        <main className="flex-1 flex flex-col overflow-hidden">
          {currentView === "todo"
            ? <TodoView />
            : currentView === "workspace"
              ? (
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-text-muted">{t(lang, "authWorking")}</div>}>
                  <WorkspaceView onOpenAuth={() => setAuthOpen(true)} />
                </Suspense>
              )
              : <NoteEditor />}
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
