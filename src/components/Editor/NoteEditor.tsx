import React, { useCallback, useEffect, useRef, useState } from "react";
import TurndownService from "turndown";
import { emit, listen } from "@tauri-apps/api/event";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import {
  cleanupUnusedImageAttachments,
  saveNoteContent,
  loadNoteContent,
} from "@/utils/storage";
import { redo as codeMirrorRedo, undo as codeMirrorUndo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { Save, Pin, Code, Eye, Columns2, Undo2, Redo2, Link2, Unlink2 } from "lucide-react";
import { createStickyNote, closeStickyNote, isStickyOpen } from "@/utils/stickyManager";
import { handleExternalLinkClick } from "@/utils/externalLinks";
import { renderMarkdown } from "@/utils/markdown";
import { useEditorZoom } from "@/utils/editorZoom";
import { PORTAL_ACTION_EVENT, type PortalAction } from "@/utils/portalActions";
import LoadingText from "@/components/LoadingText";
import MarkdownSourceEditor from "@/components/Editor/MarkdownSourceEditor";

type MarkdownViewMode = "source" | "preview" | "split";

// TipTap stores WYSIWYG documents as HTML internally. User-authored HTML in
// Markdown mode is still treated as plain text.
function isStoredEditorHtml(content: string): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|div|img|hr|br)\b[\s\S]*>/i.test(content);
}

// Configure marked

// Configure turndown for HTML → Markdown
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  bulletListMarker: "-",
  hr: "---",
});
// contentEditable creates a <div> for a normal Enter press. Turndown treats
// block elements as paragraphs by default, which turns one Enter into two
// Markdown newlines. Keep normal div lines single-spaced while preserving an
// intentionally empty div as a blank line.
turndownService.addRule("contentEditableLine", {
  filter: "div",
  replacement: (content, node) => {
    const element = node as HTMLElement;
    const isEmptyLine = !element.textContent && element.querySelector("br");
    return isEmptyLine ? "\n\n" : `\n${content}\n`;
  },
});
// Keep images as markdown
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

const NoteEditor: React.FC = () => {
  const { notes, activeNoteId, updateNote } = useNoteStore();
  const lang = useSettingsStore((s) => s.lang);
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval);
  const codeMirrorViewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollSyncEnabledRef = useRef(true);

  // Refs to avoid stale closures in editor callbacks
  const activeNoteIdRef = useRef<string | null>(null);
  const mdContentRef = useRef("");

  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>("split");
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const [mdContent, setMdContent] = useState("");
  const [editorSessionVersion, setEditorSessionVersion] = useState(0);
  const [previewHtml, setPreviewHtml] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [stickyOpen, setStickyOpen] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorFontSize = useEditorZoom(editorContainerRef, { initialSize: 16 });
  const isSavingRef = useRef(false);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const resetEditorContent = useCallback((value: string) => {
    mdContentRef.current = value;
    setMdContent(value);
    setCanUndo(false);
    setCanRedo(false);
    setEditorSessionVersion((version) => version + 1);
  }, []);

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

  useEffect(() => {
    const handlePortalAction = (event: Event) => {
      if ((event as CustomEvent<PortalAction>).detail !== "open-note-sticky" || !activeNoteId) return;
      void createStickyNote(activeNoteId);
    };
    window.addEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
    return () => window.removeEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
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
    if (!noteId || isSavingRef.current) return;
    const contentToSave = getCurrentEditorContent();
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await saveNoteContent(noteId, contentToSave);
      await cleanupUnusedImageAttachments();
      setIsDirty(false);
      // Notify open sticky windows to update
      emit("sticky:note-updated", { noteId, content: contentToSave });
      // Brief flash of "saved" status
      setShowSaveStatus(true);
      setTimeout(() => setShowSaveStatus(false), 2000);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
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
      saveNoteContent(prevId, contentToSave)
        .then(cleanupUnusedImageAttachments)
        .catch((e) => console.error("Failed to save previous note:", e));
    }

    // Update ref for next comparison
    prevNoteIdRef.current = currentId;

    if (!currentId) {
      loadingNoteIdRef.current = null;
      resetEditorContent("");
      setIsDirty(false);
      return;
    }

    // Clear editor immediately before loading
    resetEditorContent("");
    setIsDirty(false);

    // Load new note content
    loadingNoteIdRef.current = currentId;
    loadNoteContent(currentId).then((content) => {
      // Discard stale result if user already switched to another note
      if (loadingNoteIdRef.current !== currentId) return;
      if (content) {
        if (isStoredEditorHtml(content)) {
          const markdownContent = htmlToMarkdown(content);
          resetEditorContent(markdownContent);
          updateNote(currentId, { content: markdownContent }, { touchUpdatedAt: false });
        } else {
          resetEditorContent(content);
          updateNote(currentId, { content }, { touchUpdatedAt: false });
        }
      } else {
        resetEditorContent("");
        updateNote(currentId, { content: "" }, { touchUpdatedAt: false });
      }
      setIsDirty(false);
    });
  }, [activeNoteId, getCurrentEditorContent, resetEditorContent]); // eslint-disable-line

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
          resetEditorContent(htmlToMarkdown(content));
        } else {
          resetEditorContent(content);
        }
        setIsDirty(false);
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [resetEditorContent]);

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

  // Save markdown content on change (update store only, no disk write)
  const handleMdChange = useCallback(
    (value: string) => {
      if (value === mdContentRef.current) return;
      mdContentRef.current = value;
      setMdContent(value);
      const noteId = activeNoteIdRef.current;
      if (noteId) {
        updateNote(noteId, { content: value });
        setIsDirty(true);
      }
    },
    [updateNote],
  );

  const handleUndo = useCallback(() => {
    const view = codeMirrorViewRef.current;
    if (view) codeMirrorUndo(view);
  }, []);

  const handleRedo = useCallback(() => {
    const view = codeMirrorViewRef.current;
    if (view) codeMirrorRedo(view);
  }, []);

  const handleHistoryChange = useCallback((undoAvailable: boolean, redoAvailable: boolean) => {
    setCanUndo(undoAvailable);
    setCanRedo(redoAvailable);
  }, []);

  const handleCodeMirrorViewChange = useCallback((view: EditorView | null) => {
    codeMirrorViewRef.current = view;
  }, []);

  // Sync scroll: CodeMirror -> preview
  const handleCodeMirrorScroll = useCallback((view: EditorView) => {
    if (!scrollSyncEnabledRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;

    const scroller = view.scrollDOM;
    const preview = previewRef.current;
    if (!preview) {
      isScrollingRef.current = false;
      return;
    }

    const ratio = scroller.scrollTop / (scroller.scrollHeight - scroller.clientHeight || 1);
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }, []);

  // Sync scroll: preview -> CodeMirror
  const handlePreviewScroll = useCallback(() => {
    if (!scrollSyncEnabledRef.current || isScrollingRef.current) return;
    isScrollingRef.current = true;

    const scroller = codeMirrorViewRef.current?.scrollDOM;
    const preview = previewRef.current;
    if (!scroller || !preview) {
      isScrollingRef.current = false;
      return;
    }

    const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
    scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);

    requestAnimationFrame(() => {
      isScrollingRef.current = false;
    });
  }, []);

  const toggleScrollSync = useCallback(() => {
    const nextEnabled = !scrollSyncEnabled;
    scrollSyncEnabledRef.current = nextEnabled;
    setScrollSyncEnabled(nextEnabled);
    if (nextEnabled) {
      requestAnimationFrame(() => {
        const view = codeMirrorViewRef.current;
        if (view) handleCodeMirrorScroll(view);
      });
    }
  }, [handleCodeMirrorScroll, scrollSyncEnabled]);

  useEffect(() => {
    if (markdownViewMode === "preview") return;
    requestAnimationFrame(() => codeMirrorViewRef.current?.requestMeasure());
  }, [editorFontSize, markdownViewMode]);

  // Resolve local image files asynchronously through Tauri's filesystem API.
  // Cancel stale renders so switching notes cannot paint an older preview.
  useEffect(() => {
    let cancelled = false;
    renderMarkdown(mdContent)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch((error) => {
        console.error("Failed to render Markdown preview:", error);
        if (!cancelled) setPreviewHtml("");
      });
    return () => {
      cancelled = true;
    };
  }, [mdContent]);

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
    <div ref={editorContainerRef} className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title={t(lang, "undo")}
            aria-label={t(lang, "undo")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors
              hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title={t(lang, "redo")}
            aria-label={t(lang, "redo")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors
              hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Redo2 size={14} />
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-pressed={scrollSyncEnabled}
          onClick={toggleScrollSync}
          title={t(lang, scrollSyncEnabled ? "synchronizedScroll" : "independentScroll")}
          className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium leading-none transition-colors ${
            scrollSyncEnabled
              ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15"
              : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
        >
          {scrollSyncEnabled ? <Link2 size={13} /> : <Unlink2 size={13} />}
          <span>{t(lang, scrollSyncEnabled ? "synchronizedScroll" : "independentScroll")}</span>
        </button>
        {/* Save Button */}
        <button
          onClick={doSave}
          disabled={!isDirty || isSaving}
          aria-busy={isSaving}
          className={`flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium leading-none cursor-pointer transition-colors
            ${isDirty
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-bg-secondary text-text-muted cursor-not-allowed opacity-60"}`}
          title={t(lang, "save")}
        >
          {isSaving ? (
            <LoadingText label={t(lang, "save")} variant="bounce" />
          ) : (
            <>
              <Save size={12} />
              <span>{t(lang, "save")}</span>
            </>
          )}
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

      <div className="app-work-area-overlay mx-4 mb-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-bg-primary/65">
        {/* Note Title */}
        <div className="px-5 sm:px-6 pt-4 pb-3 border-b border-border bg-bg-primary/80">
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={activeNote.title}
              onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
              placeholder={t(lang, "noteTitlePlaceholder")}
              className="min-w-0 flex-1 text-2xl font-bold text-text-primary bg-transparent border-none outline-none
                placeholder:text-text-muted/50"
            />
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-text-muted">
              <span>{t(lang, "updatedAt")} {new Date(activeNote.updatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}</span>
              {/* Save Status Indicator */}
              <span>·</span>
              <span className={isDirty ? "text-amber-500" : showSaveStatus ? "text-green-500" : "text-text-muted"}>
                {isDirty ? t(lang, "unsaved") : t(lang, "saved")}
              </span>
              <span>·</span>
              <span>{tWithParams(lang, "wordCount", { count: wordCountNum })}</span>
            </div>
          </div>
          {activeNote.tags.length > 0 && (
            <div className="mt-2 flex gap-1 text-xs">
              {activeNote.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded-full bg-accent-light text-accent">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Editor Content */}
        <div className="flex min-h-0 flex-1 overflow-hidden" style={{ fontSize: editorFontSize }}>
          <div
            className={`${showMarkdownSource ? "flex" : "hidden"} ${showMarkdownPreview ? "w-1/2 border-r border-border" : "w-full"} min-h-0 flex-col overflow-hidden`}
          >
              <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
                {t(lang, "sourceEditor")}
              </div>
              <MarkdownSourceEditor
                key={`${activeNote.id}:${editorSessionVersion}`}
                value={mdContent}
                placeholder={t(lang, "mdPlaceholder")}
                onChange={handleMdChange}
                onHistoryChange={handleHistoryChange}
                onScroll={handleCodeMirrorScroll}
                onViewChange={handleCodeMirrorViewChange}
                fontSize={editorFontSize}
              />
          </div>
          {showMarkdownPreview && (
            <div className={`${showMarkdownSource ? "w-1/2" : "w-full"} flex min-h-0 flex-col overflow-hidden`}>
              <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
                {t(lang, "preview")}
              </div>
              <div
                ref={previewRef}
                onScroll={handlePreviewScroll}
                onClick={handleExternalLinkClick}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
              >
                <div
                  className="markdown-preview prose mx-auto w-full max-w-[820px] text-text-primary
                    [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4
                    [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3
                    [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-2
                    [&_p]:leading-[1.7]
                    [&_ul]:list-disc [&_ul]:pl-6
                    [&_ol]:list-decimal [&_ol]:pl-6
                    [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4
                    [&_blockquote]:italic [&_blockquote]:text-text-secondary
                    [&_hr]:border-border [&_hr]:my-4
                    [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-2
                    [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_s]:line-through
                    [&_a]:text-accent [&_a]:underline
                    [&_code]:bg-bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
