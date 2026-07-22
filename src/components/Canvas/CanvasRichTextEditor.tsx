import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";

interface CanvasRichTextEditorProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  onUpdate: (html: string, text: string) => void;
  onEditorChange: (editor: Editor | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CanvasRichTextEditor({
  content,
  className,
  style,
  onUpdate,
  onEditorChange,
  onSubmit,
  onCancel,
}: CanvasRichTextEditorProps) {
  const submitRef = useRef(onSubmit);
  const cancelRef = useRef(onCancel);
  submitRef.current = onSubmit;
  cancelRef.current = onCancel;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      FontSize.configure({ types: [TextStyle.name] }),
      Color.configure({ types: [TextStyle.name] }),
      Underline,
      Highlight.configure({ multicolor: true }),
      FontFamily.configure({ types: [TextStyle.name] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "canvas-rich-text-editor h-full w-full overflow-auto outline-none",
        spellcheck: "true",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRef.current();
          return true;
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      onUpdate(current.getHTML(), current.getText({ blockSeparator: "\n" }));
    },
  });

  useEffect(() => {
    onEditorChange(editor);
    if (!editor) return;
    const frame = window.requestAnimationFrame(() => editor.commands.focus("all"));
    return () => window.cancelAnimationFrame(frame);
  }, [editor, onEditorChange]);

  useEffect(() => () => onEditorChange(null), [onEditorChange]);

  return (
    <div
      className={className}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <EditorContent editor={editor} className="h-full w-full" />
    </div>
  );
}
