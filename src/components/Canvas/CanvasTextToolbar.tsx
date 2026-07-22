import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import type { LangType } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

interface CanvasTextToolbarProps {
  editor: Editor;
  lang: LangType;
  onDone: () => void;
}

function ToolbarButton({ active, title, onClick, children }: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 transition-colors ${active ? "bg-accent text-white" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
    >
      {children}
    </button>
  );
}

export default function CanvasTextToolbar({ editor, lang, onDone }: CanvasTextToolbarProps) {
  const color = editor.getAttributes("textStyle").color || "#212529";
  const fontSize = String(editor.getAttributes("textStyle").fontSize || "18px").replace("px", "");
  const divider = <div className="mx-1 h-5 w-px flex-shrink-0 bg-border" />;

  return (
    <div className="flex h-10 flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-bg-primary px-3">
      <select
        value={editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "p"}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
        }}
        className="h-7 rounded border border-border bg-bg-secondary px-2 text-xs text-text-primary outline-none"
        title={t(lang, "canvasTextStyle")}
      >
        <option value="p">{t(lang, "canvasParagraph")}</option>
        <option value="1">H1</option>
        <option value="2">H2</option>
        <option value="3">H3</option>
      </select>
      <select
        value={fontSize}
        onChange={(event) => editor.chain().focus().setFontSize(`${event.target.value}px`).run()}
        className="h-7 w-16 rounded border border-border bg-bg-secondary px-1 text-xs text-text-primary outline-none"
        title={t(lang, "canvasFontSize")}
      >
        {[12, 14, 16, 18, 22, 28, 36, 48, 64].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <select
        value={editor.getAttributes("textStyle").fontFamily || ""}
        onChange={(event) => event.target.value
          ? editor.chain().focus().setFontFamily(event.target.value).run()
          : editor.chain().focus().unsetFontFamily().run()}
        className="h-7 max-w-32 rounded border border-border bg-bg-secondary px-1 text-xs text-text-primary outline-none"
        title={t(lang, "canvasFontFamily")}
      >
        <option value="">{t(lang, "canvasDefaultFont")}</option>
        <option value="Segoe UI">Segoe UI</option>
        <option value="Microsoft YaHei">Microsoft YaHei</option>
        <option value="SimSun">SimSun</option>
        <option value="serif">Serif</option>
        <option value="monospace">Monospace</option>
      </select>
      {divider}
      <ToolbarButton active={editor.isActive("bold")} title={t(lang, "canvasBold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("italic")} title={t(lang, "canvasItalic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("underline")} title={t(lang, "canvasUnderline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("strike")} title={t(lang, "canvasStrike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("highlight")} title={t(lang, "canvasHighlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#fff3bf" }).run()}><Highlighter size={14} /></ToolbarButton>
      <label className="relative inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded text-text-secondary hover:bg-bg-hover" title={t(lang, "canvasTextColor")}>
        <Palette size={14} />
        <span className="absolute bottom-0.5 h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
        <input type="color" value={color.startsWith("#") ? color : "#212529"} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} className="absolute h-0 w-0 opacity-0" />
      </label>
      {divider}
      <ToolbarButton active={editor.isActive("bulletList")} title={t(lang, "canvasBulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("orderedList")} title={t(lang, "canvasOrderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive("blockquote")} title={t(lang, "canvasQuote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></ToolbarButton>
      {divider}
      <ToolbarButton active={editor.isActive({ textAlign: "left" })} title={t(lang, "canvasAlignLeft")} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: "center" })} title={t(lang, "canvasAlignCenter")} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter size={14} /></ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: "right" })} title={t(lang, "canvasAlignRight")} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight size={14} /></ToolbarButton>
      {divider}
      <ToolbarButton title={t(lang, "undo")} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={14} /></ToolbarButton>
      <ToolbarButton title={t(lang, "redo")} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={14} /></ToolbarButton>
      <div className="flex-1" />
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onDone} className="inline-flex h-7 items-center gap-1 rounded bg-accent px-2 text-xs font-medium text-white hover:bg-accent-hover">
        <Check size={14} />{t(lang, "canvasDone")}
      </button>
    </div>
  );
}
