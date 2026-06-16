import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Pin, PinOff, X } from "lucide-react";
import { loadNoteContent, loadNoteList, loadSettings } from "@/utils/storage";
import { applyTheme } from "@/utils/theme";
import { marked } from "marked";
import type { ThemeType, CustomColors } from "@/stores/settingsStore";

marked.setOptions({ breaks: true, gfm: true });

// Detect whether content is HTML or raw Markdown
function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(content);
}

interface StickyNoteProps {
  noteId: string;
}

export default function StickyNote({ noteId }: StickyNoteProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
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

  // Load note content
  useEffect(() => {
    const loadNote = async () => {
      try {
        const noteList = await loadNoteList();
        const noteMeta = noteList.find((n: { id: string }) => n.id === noteId);
        if (noteMeta) {
          setTitle(noteMeta.title || "Untitled");
        }

        const rawContent = await loadNoteContent(noteId);
        if (rawContent) {
          if (isHtmlContent(rawContent)) {
            setContent(rawContent);
          } else {
            const html = await marked(rawContent);
            setContent(typeof html === "string" ? html : rawContent);
          }
        }
      } catch (e) {
        console.error("Failed to load sticky note:", e);
      }
    };
    loadNote();
  }, [noteId]);

  const handleTogglePin = async () => {
    try {
      const newValue = !isAlwaysOnTop;
      await appWindow.setAlwaysOnTop(newValue);
      setIsAlwaysOnTop(newValue);
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error("Failed to close:", e);
    }
  };

  return (
    <div className="sticky-mode h-screen w-screen">
      <div className="sticky-container h-full flex flex-col">
        {/* Draggable Title Bar */}
        <div
          className="sticky-header flex items-center gap-2 cursor-move"
          data-tauri-drag-region
        >
          <Pin size={12} className="text-accent flex-shrink-0" />
          <span className="flex-1 truncate text-text-primary text-xs font-semibold">
            {title}
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
              onClick={handleClose}
              className="p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-colors cursor-pointer"
              title="Close"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {/* Note Content */}
        <div
          className="sticky-content flex-1 text-text-primary overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
}
