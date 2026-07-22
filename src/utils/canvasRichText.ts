import type { CanvasRichTextItem } from "@/types";

export function escapeCanvasHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function plainTextToCanvasHtml(value: string): string {
  const content = escapeCanvasHtml(value || "Text").replace(/\r?\n/g, "<br>");
  return `<p>${content}</p>`;
}

export function getCanvasRichTextHtml(item: CanvasRichTextItem): string {
  return item.html?.trim() || plainTextToCanvasHtml(item.text);
}

export function canvasHtmlToPlainText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  return (container.innerText || container.textContent || "").replace(/\u00a0/g, " ").trim();
}

/** Serialize browser-normalized HTML so it can safely live inside SVG XHTML. */
export function canvasHtmlToXhtml(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const serializer = new XMLSerializer();
  return Array.from(container.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join("");
}
