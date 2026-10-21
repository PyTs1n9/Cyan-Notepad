import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { htmlToContent } from "docx/html";

/**
 * CSS handed to the DOCX converter. `docx/html` reads `style` attributes and
 * `<style>` rules the way a browser does, so this sheet is what decides how the
 * note looks once it reaches Word: the app's theme classes carry dark-theme
 * colours that make no sense on paper, therefore everything here is neutral.
 */
const DOCX_STYLESHEET = `
  body { font-family: "微软雅黑", "Microsoft YaHei", sans-serif; font-size: 10.5pt; color: #1f1f1f; }
  p { margin: 0 0 6pt 0; line-height: 1.6; }
  h1 { font-size: 20pt; margin: 14pt 0 8pt 0; }
  h2 { font-size: 16pt; margin: 12pt 0 6pt 0; }
  h3 { font-size: 13.5pt; margin: 10pt 0 6pt 0; }
  h4, h5, h6 { font-size: 11pt; margin: 8pt 0 4pt 0; }
  ul, ol { margin: 0 0 6pt 0; }
  li { margin: 0 0 3pt 0; }
  blockquote {
    margin: 6pt 0 6pt 12pt;
    padding-left: 8pt;
    border-left: 3pt solid #a1a1aa;
    color: #52525b;
    font-style: italic;
  }
  pre {
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
    line-height: 1.45;
    background-color: #f4f4f5;
    padding: 8pt;
    margin: 6pt 0;
  }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9pt; }
  table { border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1pt solid #d4d4d8; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background-color: #f4f4f5; font-weight: bold; }
  img { max-width: 601px; }
  hr { border: none; border-top: 1pt solid #d4d4d8; margin: 10pt 0; }
  mark { background-color: #fef08a; }
  a { color: #1d4ed8; text-decoration: underline; }
  .markdown-code-language { display: none; }
  .markdown-task-checkbox { margin-right: 4pt; }
`;

/** A4 portrait, 2 cm margins, in twentieths of a point. */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1134;

export interface DocxBuildResult {
  data: Uint8Array;
  /** Images the converter had to drop, so the caller can tell the user. */
  droppedImages: number;
}

export interface DocxBuildOptions {
  title: string;
  /** Note body already rendered to HTML, with local images resolved to data URLs. */
  html: string;
}

export async function buildNoteDocx({ title, html }: DocxBuildOptions): Promise<DocxBuildResult> {
  let droppedImages = 0;

  const body = htmlToContent(html, {
    stylesheet: DOCX_STYLESHEET,
    maxImageWidth: 601,
    onWarning: (warning) => {
      if (warning.code === "missing-image" || warning.code === "unsupported-image") {
        droppedImages += 1;
        console.warn("[export:docx]", warning.message);
      }
    },
  });

  const trimmedTitle = title.trim();
  const children = trimmedTitle
    ? [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 240 },
        children: [new TextRun({ text: trimmedTitle, bold: true, size: 36 })],
      }),
      ...body,
    ]
    : [...body];

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "微软雅黑", size: 21 },
          paragraph: { spacing: { line: 336 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  const data = new Uint8Array(await blob.arrayBuffer());
  return { data, droppedImages };
}
