import { marked, type Tokens } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { readFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getDataDirectory, resolveImageAttachment } from "@/utils/storage";

const markdownRenderer = new marked.Renderer();

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("css", css);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCodeLanguage(lang?: string): string {
  return lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
}

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  cs: "C#",
  csharp: "C#",
  css: "CSS",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  powershell: "PowerShell",
  ps1: "PowerShell",
  py: "Python",
  python: "Python",
  rust: "Rust",
  rs: "Rust",
  shell: "Shell",
  sh: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

function getCodeLanguageLabel(language: string): string {
  if (!language) return "Code";
  return CODE_LANGUAGE_LABELS[language]
    ?? `${language.charAt(0).toUpperCase()}${language.slice(1)}`;
}

function highlightCode(text: string, language: string): string | null {
  if (!language || !hljs.getLanguage(language)) return null;

  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}

// Markdown permits raw HTML, but note previews are inserted as HTML. Keep the
// existing safe behavior while still allowing Markdown-generated <img> tags.
markdownRenderer.html = ({ text }: Tokens.HTML): string => escapeHtml(text);
markdownRenderer.space = ({ raw }: Tokens.Space): string => {
  const blankLineCount = Math.max(0, (raw.match(/\n/g)?.length ?? 0) - 1);
  if (blankLineCount === 0) return "";
  return `<span class="markdown-blank-lines" style="--markdown-blank-line-count:${blankLineCount}" aria-hidden="true"></span>\n`;
};
markdownRenderer.checkbox = ({ checked }: Tokens.Checkbox): string => {
  return `<input class="markdown-task-checkbox"${checked ? " checked" : ""} disabled type="checkbox">`;
};
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
markdownRenderer.code = ({ text, lang }: Tokens.Code): string => {
  const language = getCodeLanguage(lang);
  const highlighted = highlightCode(text, language);
  const languageClass = /^[a-z0-9_+#.-]+$/i.test(language)
    ? ` language-${escapeHtml(language)}`
    : "";
  const highlightClass = highlighted ? " hljs" : "";
  const code = highlighted ?? escapeHtml(text);
  const languageLabel = escapeHtml(getCodeLanguageLabel(language));

  return `<pre class="markdown-code-block"><span class="markdown-code-language">${languageLabel}</span><code class="markdown-code${highlightClass}${languageClass}">${code}</code></pre>\n`;
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

function highlightStoredHtmlCodeBlocks(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("pre > code").forEach((code) => {
    const languageClass = Array.from(code.classList).find((name) => name.startsWith("language-"));
    const language = languageClass?.slice("language-".length).toLowerCase() ?? "";
    const highlighted = highlightCode(code.textContent ?? "", language);

    const block = code.parentElement;
    block?.classList.add("markdown-code-block");
    if (block && !block.querySelector(":scope > .markdown-code-language")) {
      const languageLabel = document.createElement("span");
      languageLabel.className = "markdown-code-language";
      languageLabel.textContent = getCodeLanguageLabel(language);
      block.insertBefore(languageLabel, code);
    }
    code.classList.add("markdown-code");
    if (highlighted) {
      code.innerHTML = highlighted;
      code.classList.add("hljs");
    }
  });

  return container.innerHTML;
}

export function stripMarkdownSyntaxHighlighting(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("code.hljs").forEach((code) => {
    code.replaceChildren(document.createTextNode(code.textContent ?? ""));
    code.classList.remove("hljs");
  });

  return container.innerHTML;
}

function isHtmlContent(content: string): boolean {
  // A generic `<word>` match also treats C++ template arguments such as
  // `vector<int>` as HTML. Stored editor HTML has a matching closing tag, or
  // a real void element, so only use those as the signal.
  return /<([a-z][\w-]*)\b[^>]*>[\s\S]*<\/\1\s*>/i.test(content)
    || /<(?:img|br|hr)\b(?:\s+[^>]*)?\/?\s*>/i.test(content);
}

export async function renderStoredNoteContent(content: string): Promise<string> {
  if (!isHtmlContent(content)) return renderMarkdown(content);
  return highlightStoredHtmlCodeBlocks(await resolveHtmlImages(content));
}
