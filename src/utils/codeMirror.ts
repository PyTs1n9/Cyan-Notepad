import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentLess, insertTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const themeAwareMarkdownHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.processingInstruction, tags.punctuation, tags.bracket],
    color: "var(--color-text-secondary)",
  },
  {
    tag: [tags.heading, tags.strong],
    color: "var(--color-text-primary)",
    fontWeight: "700",
  },
  {
    tag: tags.emphasis,
    color: "var(--color-text-primary)",
    fontStyle: "italic",
  },
  {
    tag: [tags.link, tags.url, tags.labelName, tags.keyword, tags.atom, tags.bool],
    color: "color-mix(in srgb, var(--color-accent) 45%, var(--color-text-primary))",
    fontWeight: "600",
  },
  {
    tag: [tags.string, tags.character, tags.typeName, tags.className],
    color: "color-mix(in srgb, var(--color-success) 45%, var(--color-text-primary))",
  },
  {
    tag: [tags.number, tags.annotation, tags.changed],
    color: "color-mix(in srgb, var(--color-warning) 38%, var(--color-text-primary))",
  },
  {
    tag: [tags.regexp, tags.escape, tags.invalid, tags.deleted],
    color: "color-mix(in srgb, var(--color-danger) 50%, var(--color-text-primary))",
  },
  {
    tag: [tags.comment, tags.quote],
    color: "color-mix(in srgb, var(--color-text-secondary) 78%, var(--color-text-primary))",
    fontStyle: "italic",
  },
  {
    tag: [tags.operator, tags.propertyName, tags.attributeName],
    color: "var(--color-text-secondary)",
  },
  {
    tag: [tags.monospace, tags.content, tags.variableName, tags.name],
    color: "var(--color-text-primary)",
  },
]);

export const themeAwareMarkdownHighlighting = syntaxHighlighting(themeAwareMarkdownHighlightStyle);

export function codeMirrorFontSizeTheme(fontSize: number): Extension {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px` },
  });
}

export const literalTabIndentation: Extension = [
  EditorState.tabSize.of(4),
  indentUnit.of("\t"),
  Prec.highest(keymap.of([{ key: "Tab", run: insertTab, shift: indentLess }])),
];
