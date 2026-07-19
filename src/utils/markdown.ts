import { marked, type Tokens } from "marked";
import { readFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getDataDirectory, resolveImageAttachment } from "@/utils/storage";

const markdownRenderer = new marked.Renderer();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Markdown permits raw HTML, but note previews are inserted as HTML. Keep the
// existing safe behavior while still allowing Markdown-generated <img> tags.
markdownRenderer.html = ({ text }: Tokens.HTML): string => escapeHtml(text);
markdownRenderer.image = ({ href, title, text }: Tokens.Image): string => {
  const marker = /#attachment=([^#]+)$/i.exec(href);
  const src = marker ? href.slice(0, marker.index) : href;
  const attributes = [`src="${escapeHtml(src)}"`, `alt="${escapeHtml(text)}"`];
  if (title) attributes.push(`title="${escapeHtml(title)}"`);
  if (marker) {
    attributes.push(`data-attachment-src="attachment://${escapeHtml(decodeUrl(marker[1]))}"`);
  }
  return `<img ${attributes.join(" ")}>`;
};

const IMAGE_MARKDOWN_PATTERN = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]+\)))?\s*\)/g;
const IMAGE_HTML_PATTERN = /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi;

function decodeUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isNonFileImageSource(source: string): boolean {
  return /^(?:https?:|data:|blob:|\/\/|about:|#)/i.test(source);
}

function fileUrlToPath(source: string): string | null {
  if (!/^file:\/\//i.test(source)) return null;

  try {
    const url = new URL(source);
    let path = decodeURIComponent(url.pathname);
    if (url.host && url.host !== "localhost") {
      path = `\\\\${url.host}${path.replace(/\//g, "\\")}`;
    } else if (/^\/[A-Za-z]:\//.test(path)) {
      path = path.slice(1);
    }
    return path.replace(/\//g, "\\");
  } catch {
    return null;
  }
}

function isAbsoluteFilePath(source: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(source);
}

function imageMimeType(path: string): string {
  const extension = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    case "ico":
      return "image/x-icon";
    default:
      return "image/png";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function resolveLocalImagePath(source: string): Promise<string | null> {
  const decodedSource = decodeUrl(source.trim());

  const attachmentMatch = /^attachment:\/\/([^/?#]+)$/i.exec(decodedSource);
  if (attachmentMatch) {
    const attachmentPath = await resolveImageAttachment(attachmentMatch[1]);
    return attachmentPath
      ? `${convertFileSrc(attachmentPath)}#attachment=${encodeURIComponent(attachmentMatch[1])}`
      : null;
  }

  const filePath = fileUrlToPath(decodedSource) ?? decodedSource;

  let path = filePath;
  if (!isAbsoluteFilePath(path)) {
    try {
      const dataDirectory = await getDataDirectory();
      path = await join(dataDirectory, "notes", path);
    } catch {
      return null;
    }
  }

  try {
    const bytes = await readFile(path);
    return `data:${imageMimeType(path)};base64,${bytesToBase64(bytes)}`;
  } catch {
    // Keep the original source when a referenced file is unavailable. This
    // preserves normal browser/network URLs and makes broken links inspectable.
    return null;
  }
}

async function resolveImageSource(source: string): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed || isNonFileImageSource(trimmed)) return trimmed;
  return (await resolveLocalImagePath(trimmed)) ?? source;
}

async function resolveMarkdownImages(content: string): Promise<string> {
  const matches = [...content.matchAll(IMAGE_MARKDOWN_PATTERN)];
  if (matches.length === 0) return content;

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const source = match[1] ?? match[2];
    if (!source) continue;

    const destinationStart = match[0].indexOf("](") + 2;
    const sourceOffset = match[0].indexOf(source, destinationStart);
    const absoluteSourceStart = matchIndex + sourceOffset;
    const resolvedSource = await resolveImageSource(source);

    result += content.slice(cursor, absoluteSourceStart);
    result += resolvedSource;
    cursor = absoluteSourceStart + source.length;
  }
  return result + content.slice(cursor);
}

export async function resolveHtmlImages(content: string): Promise<string> {
  const matches = [...content.matchAll(IMAGE_HTML_PATTERN)];
  if (matches.length === 0) return content;

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const prefix = match[1];
    const quote = match[2];
    const source = match[3];
    const absoluteSourceStart = matchIndex + prefix.length + quote.length;
    const resolvedSource = await resolveImageSource(source);

    result += content.slice(cursor, absoluteSourceStart);
    result += resolvedSource;
    cursor = absoluteSourceStart + source.length;
  }
  return result + content.slice(cursor);
}

export async function renderMarkdown(content: string): Promise<string> {
  const resolvedContent = await resolveMarkdownImages(content);
  const html = marked.parse(resolvedContent, {
    breaks: true,
    gfm: true,
    renderer: markdownRenderer,
  });
  return typeof html === "string" ? html : await html;
}

function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(content);
}

export async function renderStoredNoteContent(content: string): Promise<string> {
  return isHtmlContent(content) ? resolveHtmlImages(content) : renderMarkdown(content);
}
