import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
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
import { useFontStore } from "@/stores/fontStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { saveNoteContent, loadNoteContent } from "@/utils/storage";
import { Wrench, FileDown, FileText } from "lucide-react";
import Toolbar from "./Toolbar";

type EditorMode = "wysiwyg" | "markdown";

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
  const { addFont } = useFontStore();
  const lang = useSettingsStore((s) => s.lang);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const [editorMode, setEditorMode] = useState<EditorMode>("wysiwyg");
  const [mdContent, setMdContent] = useState("");
  const [toolbarVisible, setToolbarVisible] = useState(true);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({ types: [TextStyle.name] }),
      Underline,
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: t(lang, "editorPlaceholder") }),
      FontFamily.configure({ types: [TextStyle.name] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
    ],
    content: "",
    onUpdate: ({ editor }) => {
      if (!activeNoteId) return;
      const html = editor.getHTML();
      updateNote(activeNoteId, { content: html });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveNoteContent(activeNoteId, html);
      }, 800);
    },
  });

  // Load note content when active note changes
  useEffect(() => {
    if (!activeNoteId || !editor) {
      console.log("[load] skip - activeNoteId:", activeNoteId, "editor:", !!editor);
      return;
    }
    console.log("[load] loading content for:", activeNoteId);
    loadNoteContent(activeNoteId).then((content) => {
      console.log("[load] loaded, length:", content.length, "first 100:", content.slice(0, 100));
      if (editorMode === "wysiwyg") {
        if (content) {
          editor.commands.setContent(content);
        }
      } else {
        // Convert stored HTML to markdown for display
        if (content) {
          const md = turndownService.turndown(content);
          setMdContent(md);
        } else {
          setMdContent("");
        }
      }
    });
  }, [activeNoteId, editor]); // eslint-disable-line

  // Save markdown content on change (store as markdown)
  const handleMdChange = useCallback(
    (value: string) => {
      setMdContent(value);
      if (!activeNoteId) return;
      // Store as HTML for WYSIWYG compatibility
      const html = marked(value) as string;
      updateNote(activeNoteId, { content: html });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveNoteContent(activeNoteId, value);
      }, 800);
    },
    [activeNoteId, updateNote],
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
        // WYSIWYG → MD: convert HTML to Markdown
        const html = editor ? editor.getHTML() : "";
        const md = turndownService.turndown(html);
        setMdContent(md);
      } else {
        // MD → WYSIWYG: convert Markdown to HTML
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
      console.log("[export-md] html length:", html.length);
      const md = turndownService.turndown(html);
      console.log("[export-md] md length:", md.length);
      const defaultPath = `${activeNote.title || t(lang, "untitled")}.md`;
      console.log("[export-md] calling save dialog, defaultPath:", defaultPath);
      const savePath = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath,
      });
      console.log("[export-md] save dialog returned:", savePath);
      if (savePath) {
        await writeTextFile(savePath, md);
        console.log("[export-md] wrote file successfully");
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
      console.log("[export-txt] txt length:", txt.length);
      const defaultPath = `${activeNote.title || t(lang, "untitled")}.txt`;
      console.log("[export-txt] calling save dialog");
      const savePath = await save({
        filters: [{ name: "Text", extensions: ["txt"] }],
        defaultPath,
      });
      console.log("[export-txt] save dialog returned:", savePath);
      if (savePath) {
        await writeTextFile(savePath, txt);
        console.log("[export-txt] wrote file successfully");
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

  const handleImportFont = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }],
        multiple: false,
      });
      if (selected) {
        const filePath = selected as string;
        const fileName = filePath.split(/[\\/]/).pop() || "font";
        const fontName = fileName.replace(/\.(ttf|otf|woff2?)$/i, "");
        const family = `custom-${fontName}-${Date.now()}`;

        const data = await readFile(filePath);
        const base64 = toBase64(new Uint8Array(data));
        const ext = filePath.split(".").pop()?.toLowerCase() || "ttf";
        const mime =
          ext === "otf"
            ? "font/otf"
            : ext === "woff2"
              ? "font/woff2"
              : ext === "woff"
                ? "font/woff"
                : "font/ttf";
        const dataUrl = `data:${mime};base64,${base64}`;

        const style = document.createElement("style");
        style.textContent = `@font-face { font-family: '${family}'; src: url('${dataUrl}'); }`;
        document.head.appendChild(style);

        addFont({ name: fontName, family, path: dataUrl });
      }
    } catch (e) {
      console.error("Failed to import font:", e);
    }
  }, [addFont]);

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
      if (activeNoteId) {
        const html = marked(newContent) as string;
        updateNote(activeNoteId, { content: html });
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveNoteContent(activeNoteId, newContent);
        }, 800);
      }

      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + text.length;
        textarea.selectionEnd = start + text.length;
      }, 0);
    },
    [mdContent, activeNoteId, updateNote],
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
      if (activeNoteId) {
        const html = marked(newContent) as string;
        updateNote(activeNoteId, { content: html });
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          saveNoteContent(activeNoteId, newContent);
        }, 800);
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
    [mdContent, activeNoteId, updateNote],
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

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
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

  return (
    <div className="flex-1 flex flex-col h-full">
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
          onImportFont={handleImportFont}
          onMdWrap={wrapSelection}
          onMdInsert={insertAtCursor}
        />
      )}

      {/* Editor Content */}
      {editorMode === "wysiwyg" ? (
        <div className="flex-1 overflow-y-auto">
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
        <div className="flex-1 flex overflow-hidden">
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
              className="flex-1 px-6 py-4 bg-bg-primary text-text-primary text-sm font-mono leading-relaxed
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
              className="flex-1 px-6 py-4 overflow-y-auto prose prose-sm max-w-none text-text-primary
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
