import React, { useRef } from "react";
import { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  ImagePlus,
  Minus,
  Tag,
  Palette,
  Code,
} from "lucide-react";

type EditorMode = "wysiwyg" | "markdown";

interface ToolbarProps {
  editor: Editor | null;
  editorMode: EditorMode;
  onInsertImage: () => void;
  onInsertTag: () => void;
  onMdWrap: (before: string, after: string) => void;
  onMdInsert: (text: string) => void;
}

const COLORS = [
  "#212529", "#495057", "#868e96",
  "#fa5252", "#e64980", "#be4bdb",
  "#7950f2", "#4c6ef5", "#228be6",
  "#15aabf", "#12b886", "#40c057",
  "#82c91e", "#fab005", "#fd7e14",
];

const Toolbar: React.FC<ToolbarProps> = ({
  editor,
  editorMode,
  onInsertImage,
  onInsertTag,
  onMdWrap,
  onMdInsert,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const isMd = editorMode === "markdown";

  if (!editor && !isMd) return null;

  const ToolbarBtn = ({
    active,
    onClick,
    title,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded cursor-pointer transition-colors flex items-center justify-center
        ${active ? "bg-accent-light text-accent" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-border mx-1" />;

  // Bold: **text**
  const handleBold = () => {
    if (isMd) {
      onMdWrap("**", "**");
    } else {
      editor?.chain().focus().toggleBold().run();
    }
  };

  // Italic: *text*
  const handleItalic = () => {
    if (isMd) {
      onMdWrap("*", "*");
    } else {
      editor?.chain().focus().toggleItalic().run();
    }
  };

  // Underline: <u>text</u> (no native markdown)
  const handleUnderline = () => {
    if (isMd) {
      onMdWrap("<u>", "</u>");
    } else {
      editor?.chain().focus().toggleUnderline().run();
    }
  };

  // Strikethrough: ~~text~~
  const handleStrike = () => {
    if (isMd) {
      onMdWrap("~~", "~~");
    } else {
      editor?.chain().focus().toggleStrike().run();
    }
  };

  // Highlight: ==text== (GFM extension)
  const handleHighlight = () => {
    if (isMd) {
      onMdWrap("==", "==");
    } else {
      editor?.chain().focus().toggleHighlight().run();
    }
  };

  // Headings: # ## ###
  const handleHeading = (level: 1 | 2 | 3) => {
    if (isMd) {
      const prefix = "#".repeat(level) + " ";
      onMdInsert(prefix);
    } else {
      editor?.chain().focus().toggleHeading({ level }).run();
    }
  };

  // Lists: - or 1.
  const handleBulletList = () => {
    if (isMd) {
      onMdInsert("- ");
    } else {
      editor?.chain().focus().toggleBulletList().run();
    }
  };

  const handleOrderedList = () => {
    if (isMd) {
      onMdInsert("1. ");
    } else {
      editor?.chain().focus().toggleOrderedList().run();
    }
  };

  // Blockquote: >
  const handleBlockquote = () => {
    if (isMd) {
      onMdInsert("> ");
    } else {
      editor?.chain().focus().toggleBlockquote().run();
    }
  };

  // Alignment (HTML fallback in MD mode)
  const handleAlign = (align: "left" | "center" | "right") => {
    if (isMd) {
      onMdWrap(`<div align="${align}">`, "</div>");
    } else {
      editor?.chain().focus().setTextAlign(align).run();
    }
  };

  // Horizontal rule: ---
  const handleHr = () => {
    if (isMd) {
      onMdInsert("\n\n---\n\n");
    } else {
      editor?.chain().focus().setHorizontalRule().run();
    }
  };

  // Color (HTML fallback in MD mode)
  const handleColor = (color: string) => {
    if (isMd) {
      onMdWrap(`<span style="color:${color}">`, "</span>");
    } else {
      editor?.chain().focus().setColor(color).run();
    }
  };

  // Inline code: `code`
  const handleCode = () => {
    if (isMd) {
      onMdWrap("`", "`");
    } else {
      editor?.chain().focus().toggleCode().run();
    }
  };

  return (
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border bg-bg-primary flex-wrap">
      {/* Bold */}
      <ToolbarBtn active={!isMd && editor?.isActive("bold")} onClick={handleBold} title="Bold">
        <Bold size={14} />
      </ToolbarBtn>

      {/* Italic */}
      <ToolbarBtn active={!isMd && editor?.isActive("italic")} onClick={handleItalic} title="Italic">
        <Italic size={14} />
      </ToolbarBtn>

      {/* Underline */}
      <ToolbarBtn active={!isMd && editor?.isActive("underline")} onClick={handleUnderline} title="Underline">
        <Underline size={14} />
      </ToolbarBtn>

      {/* Strike */}
      <ToolbarBtn active={!isMd && editor?.isActive("strike")} onClick={handleStrike} title="Strikethrough">
        <Strikethrough size={14} />
      </ToolbarBtn>

      {/* Code */}
      <ToolbarBtn active={!isMd && editor?.isActive("code")} onClick={handleCode} title="Code">
        <Code size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Text Color */}
      <div className="relative">
        <button
          onClick={() => colorInputRef.current?.click()}
          title="Color"
          className="p-1.5 rounded cursor-pointer text-text-secondary hover:bg-bg-hover transition-colors flex items-center gap-0.5"
        >
          <Palette size={14} />
          <div
            className="w-3 h-3 rounded-sm border border-border"
            style={{ backgroundColor: isMd ? "#212529" : (editor?.getAttributes("textStyle").color || "#212529") }}
          />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          className="absolute opacity-0 w-0 h-0"
          onChange={(e) => handleColor(e.target.value)}
          value={isMd ? "#212529" : (editor?.getAttributes("textStyle").color || "#212529")}
        />
      </div>

      {/* Quick Colors */}
      <div className="flex gap-0.5">
        {COLORS.slice(3, 9).map((color) => (
          <button
            key={color}
            onClick={() => handleColor(color)}
            className="w-4 h-4 rounded-sm border border-border cursor-pointer hover:scale-110 transition-transform"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      <Divider />

      {/* Highlight */}
      <ToolbarBtn active={!isMd && editor?.isActive("highlight")} onClick={handleHighlight} title="Highlight">
        <Highlighter size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Headings */}
      <ToolbarBtn active={!isMd && editor?.isActive("heading", { level: 1 })} onClick={() => handleHeading(1)} title="H1">
        <Heading1 size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive("heading", { level: 2 })} onClick={() => handleHeading(2)} title="H2">
        <Heading2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive("heading", { level: 3 })} onClick={() => handleHeading(3)} title="H3">
        <Heading3 size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Lists */}
      <ToolbarBtn active={!isMd && editor?.isActive("bulletList")} onClick={handleBulletList} title="Bullet List">
        <List size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive("orderedList")} onClick={handleOrderedList} title="Ordered List">
        <ListOrdered size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive("blockquote")} onClick={handleBlockquote} title="Blockquote">
        <Quote size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Alignment */}
      <ToolbarBtn active={!isMd && editor?.isActive({ textAlign: "left" })} onClick={() => handleAlign("left")} title="Align Left">
        <AlignLeft size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive({ textAlign: "center" })} onClick={() => handleAlign("center")} title="Align Center">
        <AlignCenter size={14} />
      </ToolbarBtn>
      <ToolbarBtn active={!isMd && editor?.isActive({ textAlign: "right" })} onClick={() => handleAlign("right")} title="Align Right">
        <AlignRight size={14} />
      </ToolbarBtn>

      <Divider />

      {/* Insert */}
      <ToolbarBtn onClick={onInsertImage} title="Image">
        <ImagePlus size={14} />
      </ToolbarBtn>
      <ToolbarBtn onClick={handleHr} title="Horizontal Rule">
        <Minus size={14} />
      </ToolbarBtn>
      <ToolbarBtn onClick={onInsertTag} title="Tag">
        <Tag size={14} />
      </ToolbarBtn>
    </div>
  );
};

export default Toolbar;
