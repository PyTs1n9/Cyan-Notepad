import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { Pin, PinOff, X } from "lucide-react";
import { loadNoteContent, loadNoteList, loadSettings, saveNoteContent } from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { marked } from "marked";
import type { ThemeType, CustomColors } from "@/stores/settingsStore";
import { handleExternalLinkClick } from "@/utils/externalLinks";

marked.setOptions({ breaks: true, gfm: true });

// Detect whether content is HTML or raw Markdown
function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(content);
}

const MIN_FONT = 10;
const MAX_FONT = 32;
const DEFAULT_FONT = 13;
const FONT_STEP = 1;

interface StickyNoteProps {
  noteId: string;
}

export default function StickyNote({ noteId }: StickyNoteProps) {
  const [title, setTitle] = useState("");
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT);
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  // Track whether we initiated a save (to ignore our own echo event)
  const selfSaveRef = useRef(false);
  const appWindow = getCurrentWindow();

  // Set sticky body class for transparent background
  useEffect(() => {
    document.body.classList.add("sticky-body");
    return () => {
      document.body.classList.remove("sticky-body");
    };
  }, []);

  // Load theme from settings.json and apply CSS variables
  useEffect(() => {
    const initTheme = async () => {
      try {
        const settings = await loadSettings();
        const theme = (settings.theme as ThemeType) || "blue";
        const customColors = (settings.customColors as CustomColors | null) || null;
        applyTheme(theme, customColors);
      } catch (e) {
        console.error("Failed to load theme for sticky:", e);
      }
    };
    initTheme();
  }, []);

  // Load note content and inject into contentEditable
  useEffect(() => {
    const loadNote = async () => {
      try {
        const noteIndex = await loadNoteList();
        const noteMeta = noteIndex.notes.find((n: { id: string }) => n.id === noteId);
        if (noteMeta) {
          setTitle(noteMeta.title || "Untitled");
        }

        const rawContent = await loadNoteContent(noteId);
        if (rawContent && editorRef.current) {
          if (isHtmlContent(rawContent)) {
            editorRef.current.innerHTML = rawContent;
          } else {
            const html = await marked(rawContent);
            editorRef.current.innerHTML =
              typeof html === "string" ? html : rawContent;
          }
        }
      } catch (e) {
        console.error("Failed to load sticky note:", e);
      }
    };
    loadNote();
  }, [noteId]);

  // Listen for content updates from main editor
  useEffect(() => {
    const unlisten = listen<{ noteId: string; content: string }>(
      "sticky:note-updated",
      (event) => {
        if (event.payload.noteId !== noteId) return;
        // Ignore if this update was triggered by our own save
        if (selfSaveRef.current) {
          selfSaveRef.current = false;
          return;
        }
        const rawContent = event.payload.content;
        if (editorRef.current && rawContent) {
          if (isHtmlContent(rawContent)) {
            editorRef.current.innerHTML = rawContent;
          } else {
            // Markdown → HTML for display
            const html = marked(rawContent);
            editorRef.current.innerHTML =
              typeof html === "string" ? html : rawContent;
          }
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [noteId]);

  // Debounced auto-save with event emission
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        await saveNoteContent(noteId, content);
        // Notify main editor about the change
        selfSaveRef.current = true;
        emit("sticky:note-saved", { noteId, content });
      }
    }, 800);
  }, [noteId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleInput = () => {
    if (!isComposingRef.current) {
      scheduleAutoSave();
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    scheduleAutoSave();
  };

  // Ctrl + wheel to zoom font size
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFontSize((prev) => {
        const delta = e.deltaY < 0 ? FONT_STEP : -FONT_STEP;
        return Math.min(MAX_FONT, Math.max(MIN_FONT, prev + delta));
      });
    },
    [],
  );

  // Close: save content, notify main window, and destroy window
  const closeSticky = useCallback(async () => {
    try {
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        await saveNoteContent(noteId, content);
        emit("sticky:note-saved", { noteId, content });
      }
      // Notify main window to clear tracking before destroying
      emit("sticky:closed", { noteId });
      await appWindow.close();
    } catch (e) {
      console.error("Failed to close sticky:", e);
    }
  }, [appWindow, noteId]);





  const handleTitleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      closeSticky();
    },
    [closeSticky],
  );

  const handleTogglePin = async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await appWindow.setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  return (
    <div className="sticky-mode h-screen w-screen">
      <div className="sticky-container h-full flex flex-col">
        {/* Draggable Title Bar — double-click to close */}
        <div
          className="sticky-header flex items-center gap-2 select-none"
        >
          <span className="flex-shrink-0 cursor-move" data-tauri-drag-region>
            <Pin size={12} className="text-accent" />
          </span>
          <span
            className="sticky-title max-w-[55%] truncate text-text-primary text-xs font-semibold cursor-pointer"
            onDoubleClick={handleTitleDoubleClick}
            title={title}
          >
            {title}
          </span>
          <span className="flex-1 self-stretch cursor-move" data-tauri-drag-region />
          <span className="text-[10px] text-text-muted tabular-nums select-none">
            {fontSize}px
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleTogglePin}
              className={`p-1 rounded hover:bg-bg-hover transition-colors cursor-pointer ${isAlwaysOnTop ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
              title={isAlwaysOnTop ? "Unpin" : "Pin"}
            >
              {isAlwaysOnTop ? <PinOff size={11} /> : <Pin size={11} />}
            </button>
            <button
              onClick={closeSticky}
              className="p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-colors cursor-pointer"
              title="Close"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {/* Editable Note Content */}
        <div
          ref={editorRef}
          className="sticky-content flex-1 text-text-primary overflow-y-auto outline-none"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onClick={handleExternalLinkClick}
          onWheel={handleWheel}
          style={{ fontSize: `${fontSize}px` }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
