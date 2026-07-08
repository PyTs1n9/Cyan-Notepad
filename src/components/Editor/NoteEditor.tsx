import React, { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import { emit, listen } from "@tauri-apps/api/event";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { saveNoteContent, loadNoteContent } from "@/utils/storage";
import { Save, Pin, Code, Eye, Columns2 } from "lucide-react";
import { createStickyNote, closeStickyNote, isStickyOpen } from "@/utils/stickyManager";
import { handleExternalLinkClick } from "@/utils/externalLinks";

type MarkdownViewMode = "source" | "preview" | "split";

// TipTap stores WYSIWYG documents as HTML internally. User-authored HTML in
// Markdown mode is still treated as plain text.
function isStoredEditorHtml(content: string): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|div|img|hr|br)\b[\s\S]*>/i.test(content);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Configure marked
const markdownRenderer = new marked.Renderer();
markdownRenderer.html = ({ text }) => escapeHtml(text);
marked.setOptions({ breaks: true, gfm: true, renderer: markdownRenderer });

// Configure turndown for HTML → Markdown
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  bulletListMarker: "-",
  hr: "---",
});
// Keep images as markdown
turndownService.addRule("img", {
  filter: "img",
  replacement: (_content, node) => {
    const el = node as HTMLImageElement;
    return `![${el.alt || "image"}](${el.src})`;
  },
});

function htmlToMarkdown(html: string): string {
  return turndownService
    .turndown(html)
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, "$1");
}

const NoteEditor: React.FC = () => {
  const { notes, activeNoteId, updateNote } = useNoteStore();
  const lang = useSettingsStore((s) => s.lang);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Refs to avoid stale closures in editor callbacks
  const activeNoteIdRef = useRef<string | null>(null);
  const mdContentRef = useRef("");

  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>("split");
  const [mdContent, setMdContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(16);
  const [stickyOpen, setStickyOpen] = useState(false);

  const EDITOR_FONT_SIZE_MIN = 12;
  const EDITOR_FONT_SIZE_MAX = 32;
  const EDITOR_FONT_SIZE_STEP = 1;

  const editorContainerRef = useRef<HTMLDivElement>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const getCurrentEditorContent = useCallback(() => {
    return mdContentRef.current;
  }, []);

  // Track sticky window open state via polling (lightweight check)
  useEffect(() => {
    if (!activeNoteId) { setStickyOpen(false); return; }
    setStickyOpen(isStickyOpen(activeNoteId));
    const timer = setInterval(() => {
      setStickyOpen(isStickyOpen(activeNoteId));
    }, 500);
    return () => clearInterval(timer);
  }, [activeNoteId]);

  // Keep refs in sync with state
  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    mdContentRef.current = mdContent;
  }, [mdContent]);

  // Save function: persists current content to disk and notifies sticky windows
  const doSave = useCallback(async () => {
    const noteId = activeNoteIdRef.current;
    if (!noteId) return;
    const contentToSave = getCurrentEditorContent();
    await saveNoteContent(noteId, contentToSave);
    setIsDirty(false);
    // Notify open sticky windows to update
    emit("sticky:note-updated", { noteId, content: contentToSave });
    // Brief flash of "saved" status
    setShowSaveStatus(true);
    setTimeout(() => setShowSaveStatus(false), 2000);
  }, [getCurrentEditorContent]);

  // Track previous activeNoteId to detect switches
  const prevNoteIdRef = useRef<string | null>(null);
  // Guard against stale async loadNoteContent callbacks (race condition)
  const loadingNoteIdRef = useRef<string | null>(null);

  // When activeNoteId changes: save old note, clear editor, load new note
  useEffect(() => {
    const prevId = prevNoteIdRef.current;
    const currentId = activeNoteId;

    // Save previous note's content to disk before switching
    if (prevId && prevId !== currentId) {
      const contentToSave = getCurrentEditorContent();
      saveNoteContent(prevId, contentToSave).catch((e) =>
        console.error("Failed to save previous note:", e)
      );
    }

    // Update ref for next comparison
    prevNoteIdRef.current = currentId;

    if (!currentId) {
      loadingNoteIdRef.current = null;
      setMdContent("");
      setIsDirty(false);
      return;
    }

    // Clear editor immediately before loading
    setMdContent("");
    setIsDirty(false);

    // Load new note content
    loadingNoteIdRef.current = currentId;
    loadNoteContent(currentId).then((content) => {
      // Discard stale result if user already switched to another note
      if (loadingNoteIdRef.current !== currentId) return;
      if (content) {
        if (isStoredEditorHtml(content)) {
          const markdownContent = htmlToMarkdown(content);
          setMdContent(markdownContent);
          updateNote(currentId, { content: markdownContent }, { touchUpdatedAt: false });
        } else {
          setMdContent(content);
          updateNote(currentId, { content }, { touchUpdatedAt: false });
        }
      } else {
        setMdContent("");
        updateNote(currentId, { content: "" }, { touchUpdatedAt: false });
      }
      setIsDirty(false);
    });
  }, [activeNoteId, getCurrentEditorContent]); // eslint-disable-line

  useEffect(() => {
    if (!autoSaveInterval || !activeNoteId) return;
    const timer = setInterval(() => {
      if (!activeNoteIdRef.current || !isDirty) return;
      doSave();
    }, autoSaveInterval);
    return () => clearInterval(timer);
  }, [autoSaveInterval, activeNoteId, isDirty, doSave]);

  // Listen for sticky save events — update editor when sticky saves same note
  useEffect(() => {
    const unlisten = listen<{ noteId: string; content: string }>(
      "sticky:note-saved",
      (event) => {
        const { noteId: savedId, content } = event.payload;
        if (savedId !== activeNoteIdRef.current) return;
        // Reload content into editor (avoid echo loop)
        if (!content) return;
        if (isStoredEditorHtml(content)) {
          setMdContent(htmlToMarkdown(content));
        } else {
          setMdContent(content);
        }
        setIsDirty(false);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Ctrl+S / Cmd+S save handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSaveShortcut =
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        (e.key.toLowerCase() === "s" || e.code === "KeyS");

      if (isSaveShortcut) {
        e.preventDefault();
        e.stopPropagation();
        void doSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [doSave]);

  // Ctrl+Wheel 缩放编辑器字体
  // Use capture phase on window to intercept before WebView2 native zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const container = editorContainerRef.current;
        if (container && container.contains(e.target as Node)) {
          e.preventDefault();
          setEditorFontSize((prev) => {
            if (e.deltaY < 0) {
              return Math.min(prev + EDITOR_FONT_SIZE_STEP, EDITOR_FONT_SIZE_MAX);
            } else {
              return Math.max(prev - EDITOR_FONT_SIZE_STEP, EDITOR_FONT_SIZE_MIN);
            }
          });
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, true);
  }, []);

  // Save markdown content on change (update store only, no disk write)
  const handleMdChange = useCallback(
    (value: string) => {
      setMdContent(value);
      const noteId = activeNoteIdRef.current;
      if (!noteId) return;
      updateNote(noteId, { content: value });
      setIsDirty(true);
    },
    [updateNote],
  );

  // Sync scroll: textarea → preview
  const handleTextareaScroll = useCallback(() => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;

    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) {
      isScrollingRef.current = false;
      return;
    }

    const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }, []);

  // Sync scroll: preview → textarea
  const handlePreviewScroll = useCallback(() => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;

    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) {
      isScrollingRef.current = false;
      return;
    }

    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    textarea.scrollTop = ratio * (textarea.scrollHeight - textarea.clientHeight);

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }, []);

  if (!activeNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>
          <p className="text-sm">{t(lang, "selectNote")}</p>
          <p className="text-xs mt-1 opacity-70">{t(lang, "orCreateNote")}</p>
        </div>
      </div>
    );
  }

  // Render markdown preview HTML
  const previewHtml = typeof marked(mdContent) === "string" ? (marked(mdContent) as string) : "";
  const showMarkdownSource = markdownViewMode === "source" || markdownViewMode === "split";
  const showMarkdownPreview = markdownViewMode === "preview" || markdownViewMode === "split";

  const markdownViewOptions: {
    value: MarkdownViewMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: "source", label: t(lang, "mdViewSource"), icon: <Code size={13} /> },
    { value: "preview", label: t(lang, "mdViewPreview"), icon: <Eye size={13} /> },
    { value: "split", label: t(lang, "mdViewSplit"), icon: <Columns2 size={13} /> },
  ];
  const markdownViewIndex = markdownViewOptions.findIndex((option) => option.value === markdownViewMode);

  // Word count: Chinese characters + English words
  const currentText = mdContent;
  const chineseChars = (currentText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = (currentText.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").match(/[a-zA-Z0-9]+/g) || []).length;
  const wordCountNum = chineseChars + englishWords;

  return (
    <div ref={editorContainerRef} className="flex-1 flex flex-col h-full">
      {/* Markdown view controls */}
      <div className="flex items-center gap-2 px-8 pt-4 pb-1">
        <div className="relative grid h-8 grid-cols-3 items-center overflow-hidden rounded-full bg-bg-secondary p-0.5">
          <div
            className="markdown-view-pill pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full"
            style={{
              width: "calc((100% - 4px) / 3)",
              transform: `translateX(${markdownViewIndex * 100}%)`,
            }}
          >
            <span key={markdownViewMode} className="markdown-view-pill-fill" />
          </div>
          {markdownViewOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setMarkdownViewMode(option.value)}
              title={option.label}
              className={`relative z-10 flex h-7 min-w-[4.25rem] items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium leading-none cursor-pointer transition-colors duration-150
                ${markdownViewMode === option.value
                  ? "text-white"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Save Button */}
        <button
          onClick={doSave}
          disabled={!isDirty}
          className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium leading-none cursor-pointer transition-colors
            ${isDirty
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-bg-secondary text-text-muted cursor-not-allowed opacity-60"}`}
          title={t(lang, "save")}
        >
          <Save size={12} />
          <span>{t(lang, "save")}</span>
        </button>
        <button
          onClick={() => {
            if (!activeNoteId) return;
            if (stickyOpen) {
              closeStickyNote(activeNoteId);
            } else {
              createStickyNote(activeNoteId);
            }
          }}
          className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium leading-none cursor-pointer transition-colors
            ${stickyOpen
              ? "bg-accent text-white"
              : "bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
          title={t(lang, "pinSticky")}
        >
          <Pin size={12} />
          <span>{t(lang, "pinSticky")}</span>
        </button>
      </div>

      <div className="mx-4 mb-3 mt-2 flex-1 flex flex-col overflow-hidden rounded-lg border border-border bg-bg-primary/70">
        {/* Note Title */}
        <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-border bg-bg-primary/80">
        <input
          type="text"
          value={activeNote.title}
          onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
          placeholder={t(lang, "noteTitlePlaceholder")}
          className="w-full text-2xl font-bold text-text-primary bg-transparent border-none outline-none
            placeholder:text-text-muted/50"
        />
        <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
          <span>{t(lang, "createdAt")} {new Date(activeNote.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}</span>
          <span>·</span>
          <span>{t(lang, "updatedAt")} {new Date(activeNote.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}</span>
          {/* Save Status Indicator */}
          <span>·</span>
          <span className={isDirty ? "text-amber-500" : showSaveStatus ? "text-green-500" : "text-text-muted"}>
            {isDirty ? t(lang, "unsaved") : t(lang, "saved")}
          </span>
          <span>·</span>
          <span>{tWithParams(lang, "wordCount", { count: wordCountNum })}</span>
          {activeNote.tags.length > 0 && (
            <>
              <span>·</span>
              <div className="flex gap-1">
                {activeNote.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded-full bg-accent-light text-accent">
                    #{tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 flex overflow-hidden" style={{ fontSize: editorFontSize }}>
          {showMarkdownSource && (
            <div className={`${showMarkdownPreview ? "w-1/2 border-r border-border" : "w-full"} flex flex-col`}>
              <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
                {t(lang, "sourceEditor")}
              </div>
              <textarea
                ref={textareaRef}
                value={mdContent}
                onChange={(e) => handleMdChange(e.target.value)}
                onScroll={handleTextareaScroll}
                className="flex-1 px-5 sm:px-6 py-4 bg-transparent text-text-primary font-mono leading-relaxed
                  resize-none outline-none overflow-y-auto
                  placeholder:text-text-muted/40"
                placeholder={t(lang, "mdPlaceholder")}
                spellCheck={false}
              />
            </div>
          )}
          {showMarkdownPreview && (
            <div className={`${showMarkdownSource ? "w-1/2" : "w-full"} flex flex-col`}>
              <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
                {t(lang, "preview")}
              </div>
              <div
                ref={previewRef}
                onScroll={handlePreviewScroll}
                onClick={handleExternalLinkClick}
                className="flex-1 px-5 sm:px-6 py-4 overflow-y-auto prose max-w-none text-text-primary
                  [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3
                  [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-2
                  [&_p]:mb-2 [&_p]:leading-relaxed
                  [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2
                  [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2
                  [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4
                  [&_blockquote]:italic [&_blockquote]:text-text-secondary
                  [&_hr]:border-border [&_hr]:my-4
                  [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2
                  [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_s]:line-through
                  [&_a]:text-accent [&_a]:underline
                  [&_code]:bg-bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
                  [&_pre]:bg-bg-secondary [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:mb-2 [&_pre]:overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
