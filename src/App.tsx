import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TitleBar from "@/components/Layout/TitleBar";
import TodoView from "@/components/Todo/TodoView";
import NoteEditor from "@/components/Editor/NoteEditor";
import SettingsModal from "@/components/Settings/SettingsModal";
import AboutModal from "@/components/Settings/AboutModal";
import { useTodoStore } from "@/stores/todoStore";
import { useNoteStore } from "@/stores/noteStore";
import { useFontStore } from "@/stores/fontStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { CustomColors, AppShortcuts } from "@/stores/settingsStore";
import {
  loadTodos,
  saveTodos,
  loadNoteList,
  saveNoteIndex,
  loadSavedFonts,
  saveFontList,
  saveNoteContent,
  loadSettings,
  saveSettings,
  loadIconData,
} from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { openTileWindow } from "@/utils/tile";
import { applyShortcuts } from "@/utils/shortcutManager";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emit } from "@tauri-apps/api/event";
import { marked } from "marked";
import type { Todo, Note, ViewType } from "@/types";

const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 400;
const COLLAPSED_WIDTH = 52;

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("todo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDragging = useRef(false);

  const todos = useTodoStore((s) => s.todos);
  const loadTodosState = useTodoStore((s) => s.loadTodos);

  const notes = useNoteStore((s) => s.notes);
  const addNote = useNoteStore((s) => s.addNote);
  const loadNotesState = useNoteStore((s) => s.loadNotes);

  const fonts = useFontStore((s) => s.fonts);
  const loadFontsState = useFontStore((s) => s.loadFonts);

  const theme = useSettingsStore((s) => s.theme);
  const lang = useSettingsStore((s) => s.lang);
  const customColors = useSettingsStore((s) => s.customColors);
  const savedPresets = useSettingsStore((s) => s.savedPresets);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const loadSettingsState = useSettingsStore((s) => s.loadSettings);

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
        if (savedNotes.length > 0) loadNotesState(savedNotes as Note[]);
        if (savedFonts.length > 0) loadFontsState(savedFonts);
        loadSettingsState(savedSettings as {
          theme?: "dark" | "blue" | "yellow" | "green" | "custom";
          lang?: "zh" | "en";
          customColors?: CustomColors | null;
          savedPresets?: { name: string; colors: CustomColors }[];
          shortcuts?: AppShortcuts;
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
      saveSettings({ theme, lang, customColors, savedPresets, shortcuts });
    }
  }, [theme, lang, customColors, savedPresets, shortcuts, initialized]);

  // Auto-save todos
  useEffect(() => {
    if (initialized) saveTodos(todos);
  }, [todos, initialized]);

  // Auto-save note index
  useEffect(() => {
    if (initialized) {
      const index = notes.map(({ id, title, tags, createdAt, updatedAt }) => ({
        id, title, tags, createdAt, updatedAt,
      }));
      saveNoteIndex(index);
    }
  }, [notes, initialized]);

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
    }
  }, [theme, customColors, initialized]);

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
      latestX.current = e.clientX;
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
      createdAt: now,
      updatedAt: now,
    };
    addNote(note);
    saveNoteContent(note.id, "");
  };

  // Import Markdown files
  const handleImportMd = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        multiple: true,
      });
      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];
      for (const filePath of files) {
        const content = await readTextFile(filePath);
        console.log("[import] file:", filePath, "raw length:", content.length, "first 100 chars:", content.slice(0, 100));
        // Convert Markdown to HTML for WYSIWYG display
        const htmlContent = typeof marked(content) === "string" ? marked(content) as string : content;
        console.log("[import] html length:", htmlContent.length, "first 100 chars:", htmlContent.slice(0, 100));
        const fileName = filePath.split(/[\\/]/).pop() || "imported";
        const title = fileName.replace(/\.(md|markdown)$/i, "");
        const now = new Date().toISOString();
        const note: Note = {
          id: crypto.randomUUID(),
          title,
          content: "",
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        // Save content to disk BEFORE activating the note (race condition fix)
        await saveNoteContent(note.id, htmlContent);
        console.log("[import-md] saved to disk, id:", note.id);
        addNote(note);
      }
      setCurrentView("note");
    } catch (e) {
      console.error("Failed to import markdown:", e);
    }
  }, [addNote]);

  // Import Text files
  const handleImportTxt = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Text Files", extensions: ["txt"] }],
        multiple: true,
      });
      if (!selected) return;
      const files = Array.isArray(selected) ? selected : [selected];
      for (const filePath of files) {
        const content = await readTextFile(filePath);
        console.log("[import-txt] file:", filePath, "raw length:", content.length);
        // Wrap plain text as HTML paragraphs (preserve line breaks)
        const htmlContent = content
          .split(/\n/)
          .map((line) => line ? `<p>${line}</p>` : "<p><br></p>")
          .join("\n");
        console.log("[import-txt] html length:", htmlContent.length);
        const fileName = filePath.split(/[\\/]/).pop() || "imported";
        const title = fileName.replace(/\.txt$/i, "");
        const now = new Date().toISOString();
        const note: Note = {
          id: crypto.randomUUID(),
          title,
          content: "",
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        await saveNoteContent(note.id, htmlContent);
        console.log("[import-txt] saved, id:", note.id);
        addNote(note);
      }
      setCurrentView("note");
    } catch (e) {
      console.error("Failed to import text:", e);
    }
  }, [addNote]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Custom Title Bar */}
      <TitleBar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth }} className="h-full flex-shrink-0 transition-[width] duration-200 ease-in-out">
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            onNewNote={handleNewNote}
            onImportMd={handleImportMd}
            onImportTxt={handleImportTxt}
            collapsed={sidebarCollapsed}
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
          {currentView === "todo" ? <TodoView /> : <NoteEditor />}
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
