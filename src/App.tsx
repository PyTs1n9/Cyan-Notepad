import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Layout/Sidebar";
import TodoView from "@/components/Todo/TodoView";
import NoteEditor from "@/components/Editor/NoteEditor";
import SettingsModal from "@/components/Settings/SettingsModal";
import { useTodoStore } from "@/stores/todoStore";
import { useNoteStore } from "@/stores/noteStore";
import { useFontStore } from "@/stores/fontStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { CustomColors } from "@/stores/settingsStore";
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
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { marked } from "marked";
import type { Todo, Note, ViewType } from "@/types";

const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 400;
const COLLAPSED_WIDTH = 52;

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("todo");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        });

        // Load custom app icon
        const iconData = await loadIconData();
        if (iconData) {
          try {
            await getCurrentWindow().setIcon(iconData);
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
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-blue", "theme-yellow", "theme-green", "theme-custom");
    if (theme === "custom" && customColors) {
      root.classList.add("theme-custom");
      root.style.setProperty("--color-bg-primary", customColors.bgPrimary);
      root.style.setProperty("--color-bg-secondary", customColors.bgSecondary);
      root.style.setProperty("--color-bg-sidebar", customColors.bgSidebar);
      root.style.setProperty("--color-text-primary", customColors.textPrimary);
      root.style.setProperty("--color-accent", customColors.accent);
      // Derive hover/light variants
      root.style.setProperty("--color-bg-hover", customColors.bgSecondary);
      root.style.setProperty("--color-bg-active", customColors.bgSecondary);
      root.style.setProperty("--color-accent-light", customColors.bgSecondary);
      root.style.setProperty("--color-accent-hover", customColors.accent);
    } else {
      root.style.removeProperty("--color-bg-primary");
      root.style.removeProperty("--color-bg-secondary");
      root.style.removeProperty("--color-bg-sidebar");
      root.style.removeProperty("--color-text-primary");
      root.style.removeProperty("--color-accent");
      root.style.removeProperty("--color-bg-hover");
      root.style.removeProperty("--color-bg-active");
      root.style.removeProperty("--color-accent-light");
      root.style.removeProperty("--color-accent-hover");
      if (theme !== "blue") {
        root.classList.add(`theme-${theme}`);
      }
    }
  }, [theme, customColors]);

  // Auto-save settings
  useEffect(() => {
    if (initialized) {
      saveSettings({ theme, lang, customColors, savedPresets });
    }
  }, [theme, lang, customColors, savedPresets, initialized]);

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

  // Sidebar resize drag
  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
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
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <div style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth }} className="h-full flex-shrink-0 transition-[width] duration-200 ease-in-out">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          onNewNote={handleNewNote}
          onImportMd={handleImportMd}
          onImportTxt={handleImportTxt}
          onOpenSettings={() => setSettingsOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      {/* Resize Handle */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="w-1 h-full cursor-col-resize hover:bg-accent/30 active:bg-accent/50
            transition-colors flex-shrink-0 bg-border"
        />
      )}
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentView === "todo" ? <TodoView /> : <NoteEditor />}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
