import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { marked } from "marked";
import TurndownService from "turndown";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { saveNoteContent, loadNoteContent } from "@/utils/storage";
import { Wrench, FileDown, FileText, Save, Pin } from "lucide-react";
import { createStickyNote, closeStickyNote, isStickyOpen } from "@/utils/stickyManager";
import Toolbar from "./Toolbar";

type EditorMode = "wysiwyg" | "markdown";

// Detect whether stored content is HTML (from WYSIWYG) or raw Markdown
function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(content);
}

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

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

const NoteEditor: React.FC = () => {
  const { notes, activeNoteId, updateNote } = useNoteStore();
  const lang = useSettingsStore((s) => s.lang);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Refs to avoid stale closures in editor callbacks
  const activeNoteIdRef = useRef<string | null>(null);
  const mdContentRef = useRef("");
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  const [editorMode, setEditorMode] = useState<EditorMode>("wysiwyg");
  const [mdContent, setMdContent] = useState("");
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showSaveStatus, setShowSaveStatus] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(16);
  const [stickyOpen, setStickyOpen] = useState(false);

  const EDITOR_FONT_SIZE_MIN = 12;
  const EDITOR_FONT_SIZE_MAX = 32;
  const EDITOR_FONT_SIZE_STEP = 1;

  const editorContainerRef = useRef<HTMLDivElement>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId);

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

  // Save function: persists current content to disk
  const doSave = useCallback(async () => {
    const noteId = activeNoteIdRef.current;
    if (!noteId) return;
    // Get current content based on mode
    const currentMdContent = mdContentRef.current;
    const ed = editorRef.current;
    const contentToSave = currentMdContent || (ed ? ed.getHTML() : "");
    await saveNoteContent(noteId, contentToSave);
    setIsDirty(false);
    // Brief flash of "saved" status
    setShowSaveStatus(true);
    setTimeout(() => setShowSaveStatus(false), 2000);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontSize.configure({ types: [TextStyle.name] }),
      Color.configure({ types: [TextStyle.name] }),
      Underline,
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: t(lang, "editorPlaceholder") }),
      FontFamily.configure({ types: [TextStyle.name] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      const noteId = activeNoteIdRef.current;
      if (!noteId) return;
      const html = ed.getHTML();
      updateNote(noteId, { content: html });
      setIsDirty(true);
    },
  });

  // Keep editor ref in sync
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Track previous activeNoteId to detect switches
  const prevNoteIdRef = useRef<string | null>(null);

  // When activeNoteId changes: save old note, clear editor, load new note
  useEffect(() => {
    if (!editor) return;
    const prevId = prevNoteIdRef.current;
    const currentId = activeNoteId;

    // Save previous note's content to disk before switching
    if (prevId && prevId !== currentId) {
      const prevMdContent = mdContentRef.current;
      const ed = editorRef.current;
      const contentToSave = prevMdContent || (ed ? ed.getHTML() : "");
      saveNoteContent(prevId, contentToSave).catch((e) =>
        console.error("Failed to save previous note:", e)
      );
    }

    // Update ref for next comparison
    prevNoteIdRef.current = currentId;

    if (!currentId) {
      editor.commands.setContent("");
      setMdContent("");
      setIsDirty(false);
      return;
    }

    // Clear editor immediately before loading
    editor.commands.setContent("");
    setMdContent("");
    setIsDirty(false);

    // Load new note content
    loadNoteContent(currentId).then((content) => {
      if (editorMode === "wysiwyg") {
        if (content) {
          // If content is raw Markdown (not HTML), convert to HTML first for TipTap
          if (!isHtmlContent(content)) {
            const html = marked(content) as string;
            editor.commands.setContent(html);
          } else {
            editor.commands.setContent(content);
          }
        }
      } else {
        // MD mode: only turndown if content is HTML; use raw Markdown as-is
        if (content) {
          if (isHtmlContent(content)) {
            const md = turndownService.turndown(content);
            setMdContent(md);
          } else {
            setMdContent(content);
          }
        } else {
          setMdContent("");
        }
      }
    });
  }, [activeNoteId, editor]); // eslint-disable-line

  // Ctrl+S / Cmd+S save handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
      const html = marked(value) as string;
      updateNote(noteId, { content: html });
      setIsDirty(true);
    },
    [updateNote],
  );

  // Switch modes
  const switchMode = useCallback(
    async (mode: EditorMode) => {
      if (mode === editorMode) return;
      if (!activeNoteId) {
        setEditorMode(mode);
        return;
      }

      if (mode === "markdown") {
        const html = editor ? editor.getHTML() : "";
        const md = turndownService.turndown(html);
        setMdContent(md);
      } else {
        const html = marked(mdContent) as string;
        if (editor) {
          editor.commands.setContent(html);
        }
      }
      setEditorMode(mode);
    },
    [editorMode, activeNoteId, editor, mdContent],
  );

  // Export as Markdown
  const handleExportMd = useCallback(async () => {
    if (!activeNote) return;
    try {
      const html = editorMode === "wysiwyg" && editor ? editor.getHTML() : activeNote.content || "";
      const md = turndownService.turndown(html);
      const defaultPath = `${activeNote.title || t(lang, "untitled")}.md`;
      const savePath = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath,
      });
      if (savePath) {
        await writeTextFile(savePath, md);
      }
    } catch (e) {
      console.error("Export MD failed:", e);
    }
  }, [activeNote, editorMode, editor, lang]);

  // Export as Text
  const handleExportTxt = useCallback(async () => {
    if (!activeNote) return;
    try {
      const html = editorMode === "wysiwyg" && editor ? editor.getHTML() : activeNote.content || "";
      const div = document.createElement("div");
      div.innerHTML = html;
      const txt = div.textContent || div.innerText || "";
      const defaultPath = `${activeNote.title || t(lang, "untitled")}.txt`;
      const savePath = await save({
        filters: [{ name: "Text", extensions: ["txt"] }],
        defaultPath,
      });
      if (savePath) {
        await writeTextFile(savePath, txt);
      }
    } catch (e) {
      console.error("Export TXT failed:", e);
    }
  }, [activeNote, editorMode, editor, lang]);

  const toBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const handleInsertImage = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        const data = await readFile(filePath);
        const ext = filePath.split(".").pop()?.toLowerCase() || "png";
        const mime = ext === "svg" ? "svg+xml" : ext === "jpg" ? "jpeg" : ext;
        const base64 = toBase64(new Uint8Array(data));
        const dataUrl = `data:image/${mime};base64,${base64}`;

        if (editorMode === "wysiwyg" && editor) {
          editor.chain().focus().setImage({ src: dataUrl }).run();
        } else {
          insertAtCursor(`![image](${dataUrl})`);
        }
      }
    } catch (e) {
      console.error("Failed to insert image:", e);
    }
  }, [editor, editorMode]); // eslint-disable-line

  const handleInsertTag = useCallback(() => {
    const tag = prompt(t(lang, "inputTagName"));
    if (!tag) return;

    if (editorMode === "wysiwyg" && editor) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<span data-type="tag" style="background:#edf2ff;color:#4263eb;padding:1px 6px;border-radius:9999px;font-size:12px;">#${tag}</span>&nbsp;`,
        )
        .run();
    } else {
      insertAtCursor(`#${tag} `);
    }
  }, [editor, editorMode, lang]); // eslint-disable-line

  // Insert text at cursor in textarea
  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = mdContent.substring(0, start);
      const after = mdContent.substring(end);
      const newContent = before + text + after;

      setMdContent(newContent);
      const noteId = activeNoteIdRef.current;
      if (noteId) {
        const html = marked(newContent) as string;
        updateNote(noteId, { content: html });
        setIsDirty(true);
      }

      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + text.length;
        textarea.selectionEnd = start + text.length;
      }, 0);
    },
    [mdContent, updateNote],
  );

  // Wrap selected text in textarea
  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = mdContent.substring(start, end);
      const newContent =
        mdContent.substring(0, start) + before + selected + after + mdContent.substring(end);

      setMdContent(newContent);
      const noteId = activeNoteIdRef.current;
      if (noteId) {
        const html = marked(newContent) as string;
        updateNote(noteId, { content: html });
        setIsDirty(true);
      }

      setTimeout(() => {
        textarea.focus();
        if (selected) {
          textarea.selectionStart = start + before.length;
          textarea.selectionEnd = start + before.length + selected.length;
        } else {
          textarea.selectionStart = start + before.length;
          textarea.selectionEnd = start + before.length;
        }
      }, 0);
    },
    [mdContent, updateNote],
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

  // Word count: Chinese characters + English words
  const currentText = editorMode === "wysiwyg" && editor
    ? editor.state.doc.textBetween(0, editor.state.doc.content.size, " ")
    : mdContent;
  const chineseChars = (currentText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const englishWords = (currentText.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").match(/[a-zA-Z0-9]+/g) || []).length;
  const wordCountNum = chineseChars + englishWords;

  return (
    <div ref={editorContainerRef} className="flex-1 flex flex-col h-full">
      {/* Mode Toggle Bar */}
      <div className="flex items-center gap-2 px-8 pt-4 pb-1">
        <button
          onClick={() => switchMode("wysiwyg")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors
            ${editorMode === "wysiwyg" ? "bg-accent text-white" : "bg-bg-secondary text-text-secondary hover:bg-bg-hover"}`}
        >
          {t(lang, "notepadMode")}
        </button>
        <button
          onClick={() => switchMode("markdown")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors
            ${editorMode === "markdown" ? "bg-accent text-white" : "bg-bg-secondary text-text-secondary hover:bg-bg-hover"}`}
        >
          {t(lang, "mdMode")}
        </button>
        <div className="flex-1" />
        {/* Save Button */}
        <button
          onClick={doSave}
          disabled={!isDirty}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors
            ${isDirty
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-bg-secondary text-text-muted cursor-not-allowed opacity-60"}`}
          title={t(lang, "save")}
        >
          <Save size={12} />
          <span>{t(lang, "save")}</span>
        </button>
        <button
          onClick={handleExportMd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer
            bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title={t(lang, "exportMd")}
        >
          <FileDown size={12} />
          <span>{t(lang, "exportMd")}</span>
        </button>
        <button
          onClick={handleExportTxt}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer
            bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title={t(lang, "exportTxt")}
        >
          <FileText size={12} />
          <span>{t(lang, "exportTxt")}</span>
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
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors
            ${stickyOpen
              ? "bg-accent text-white"
              : "bg-bg-secondary text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
          title={t(lang, "pinSticky")}
        >
          <Pin size={12} />
          <span>{t(lang, "pinSticky")}</span>
        </button>
        <button
          onClick={() => setToolbarVisible(!toolbarVisible)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors
            ${toolbarVisible ? "bg-accent-light text-accent" : "bg-bg-secondary text-text-muted hover:bg-bg-hover"}`}
          title={t(lang, "toggleToolbar")}
        >
          <Wrench size={12} />
          <span>{t(lang, "toggleToolbar")}</span>
        </button>
      </div>

      {/* Note Title */}
      <div className="px-8 pt-3 pb-2">
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

      {/* Toolbar */}
      {toolbarVisible && (
        <Toolbar
          editor={editor}
          editorMode={editorMode}
          onInsertImage={handleInsertImage}
          onInsertTag={handleInsertTag}
          onMdWrap={wrapSelection}
          onMdInsert={insertAtCursor}
        />
      )}

      {/* Editor Content */}
      {editorMode === "wysiwyg" ? (
        <div className="flex-1 overflow-y-auto" style={{ fontSize: editorFontSize }}>
          <EditorContent
            editor={editor}
            className="px-8 py-4 min-h-full
              [&_.tiptap]:outline-none [&_.tiptap]:min-h-[400px]
              [&_.tiptap_p.is-editor-empty:first-child::before]:text-text-muted/40
              [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
              [&_.tiptap_p.is-editor-empty:first-child::before]:float-left
              [&_.tiptap_p.is-editor-empty:first-child::before]:h-0
              [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none
              [&_.tiptap_h1]:text-2xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-3
              [&_.tiptap_h2]:text-xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-2
              [&_.tiptap_h3]:text-lg [&_.tiptap_h3]:font-medium [&_.tiptap_h3]:mb-2
              [&_.tiptap_p]:mb-2 [&_.tiptap_p]:leading-relaxed [&_.tiptap_p]:text-text-primary
              [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ul]:mb-2
              [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_ol]:mb-2
              [&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-accent
              [&_.tiptap_blockquote]:pl-4 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-text-secondary
              [&_.tiptap_hr]:border-border [&_.tiptap_hr]:my-4
              [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded-lg [&_.tiptap_img]:my-2
              [&_.tiptap_mark]:bg-yellow-200 [&_.tiptap_mark]:px-0.5"
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ fontSize: editorFontSize }}>
          {/* Left: Markdown Source Editor */}
          <div className="w-1/2 flex flex-col border-r border-border">
            <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
              {t(lang, "sourceEditor")}
            </div>
            <textarea
              ref={textareaRef}
              value={mdContent}
              onChange={(e) => handleMdChange(e.target.value)}
              onScroll={handleTextareaScroll}
              className="flex-1 px-6 py-4 bg-bg-primary text-text-primary font-mono leading-relaxed
                resize-none outline-none overflow-y-auto
                placeholder:text-text-muted/40"
              placeholder={t(lang, "mdPlaceholder")}
              spellCheck={false}
            />
          </div>
          {/* Right: Preview */}
          <div className="w-1/2 flex flex-col">
            <div className="px-3 py-1.5 text-xs text-text-muted bg-bg-secondary border-b border-border font-medium">
              {t(lang, "preview")}
            </div>
            <div
              ref={previewRef}
              onScroll={handlePreviewScroll}
              className="flex-1 px-6 py-4 overflow-y-auto prose max-w-none text-text-primary
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
        </div>
      )}
    </div>
  );
};

export default NoteEditor;
