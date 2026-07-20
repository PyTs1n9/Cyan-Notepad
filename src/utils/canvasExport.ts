import type { CanvasImageItem, CanvasItem, CanvasTextItem } from "@/types";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CanvasExportOptions {
  items: CanvasItem[];
  assets: Record<string, string>;
}

const MAX_EXPORT_SIDE = 16_384;
const MAX_EXPORT_PIXELS = 67_108_864;
const PNG_EXPORT_SCALE = 2;

function getRotatedBounds(item: CanvasItem, localBounds: Bounds): Bounds {
  const centerX = item.width / 2;
  const centerY = item.height / 2;
  const radians = item.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [localBounds.minX, localBounds.minY],
    [localBounds.maxX, localBounds.minY],
    [localBounds.maxX, localBounds.maxY],
    [localBounds.minX, localBounds.maxY],
  ].map(([x, y]) => ({
    x: item.x + centerX + (x - centerX) * cosine - (y - centerY) * sine,
    y: item.y + centerY + (x - centerX) * sine + (y - centerY) * cosine,
  }));

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function getTextLocalBounds(context: CanvasRenderingContext2D, item: CanvasTextItem): Bounds | null {
  context.font = `${item.fontSize}px ${item.fontFamily}`;
  const lineHeight = item.fontSize * 1.35;
  let bounds: Bounds | null = null;

  item.text.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const metrics = context.measureText(line);
    const baseline = item.fontSize + 8 + index * lineHeight;
    const lineBounds = {
      minX: 8 - (metrics.actualBoundingBoxLeft || 0),
      minY: baseline - (metrics.actualBoundingBoxAscent || item.fontSize),
      maxX: 8 + (metrics.actualBoundingBoxRight || metrics.width),
      maxY: baseline + (metrics.actualBoundingBoxDescent || item.fontSize * 0.25),
    };
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, lineBounds.minX),
          minY: Math.min(bounds.minY, lineBounds.minY),
          maxX: Math.max(bounds.maxX, lineBounds.maxX),
          maxY: Math.max(bounds.maxY, lineBounds.maxY),
        }
      : lineBounds;
  });

  return bounds;
}

function getContentBounds(context: CanvasRenderingContext2D, items: CanvasItem[]): Bounds | null {
  return items.reduce<Bounds | null>((bounds, item) => {
    const localBounds = item.type === "image"
      ? { minX: 0, minY: 0, maxX: item.width, maxY: item.height }
      : getTextLocalBounds(context, item);
    if (!localBounds) return bounds;
    const itemBounds = getRotatedBounds(item, localBounds);
    return bounds
      ? {
          minX: Math.min(bounds.minX, itemBounds.minX),
          minY: Math.min(bounds.minY, itemBounds.minY),
          maxX: Math.max(bounds.maxX, itemBounds.maxX),
          maxY: Math.max(bounds.maxY, itemBounds.maxY),
        }
      : itemBounds;
  }, null);
}

function resolveCssColor(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color || value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadImage(item: CanvasImageItem, dataUrl: string | undefined): Promise<HTMLImageElement> {
  if (!dataUrl) return Promise.reject(new Error(`Missing canvas asset: ${item.asset}`));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to decode canvas asset: ${item.asset}`));
    image.src = dataUrl;
  });
}

function canvasToImage(canvas: HTMLCanvasElement, mimeType: "image/png" | "image/jpeg"): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG"));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, mimeType, mimeType === "image/jpeg" ? 0.95 : undefined);
  });
}

async function renderCanvasToRaster(
  { items, assets }: CanvasExportOptions,
  mimeType: "image/png" | "image/jpeg",
): Promise<Uint8Array> {
  await document.fonts.ready;

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("Canvas is unavailable");
  const bounds = getContentBounds(measureContext, items);
  if (!bounds) throw new Error("Canvas has no visible content");

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    PNG_EXPORT_SCALE,
    MAX_EXPORT_SIDE / contentWidth,
    MAX_EXPORT_SIDE / contentHeight,
    Math.sqrt(MAX_EXPORT_PIXELS / (contentWidth * contentHeight)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(contentWidth * scale));
  canvas.height = Math.max(1, Math.ceil(contentHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.fillStyle = resolveCssColor("var(--canvas-background, var(--color-bg-primary))");
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);

  const images = new Map<string, HTMLImageElement>();
  await Promise.all(items.filter((item): item is CanvasImageItem => item.type === "image").map(async (item) => {
    images.set(item.asset, await loadImage(item, assets[item.asset]));
  }));
  const resolvedColors = new Map<string, string>();

  [...items].sort((a, b) => a.zIndex - b.zIndex).forEach((item) => {
    context.save();
    context.translate(item.x + item.width / 2, item.y + item.height / 2);
    context.rotate(item.rotation * Math.PI / 180);
    context.translate(-item.width / 2, -item.height / 2);

    if (item.type === "image") {
      context.drawImage(images.get(item.asset)!, 0, 0, item.width, item.height);
    } else {
      const color = resolvedColors.get(item.color) ?? resolveCssColor(item.color);
      resolvedColors.set(item.color, color);
      context.fillStyle = color;
      context.font = `${item.fontSize}px ${item.fontFamily}`;
      context.textBaseline = "alphabetic";
      item.text.split("\n").forEach((line, index) => {
        context.fillText(line, 8, item.fontSize + 8 + index * item.fontSize * 1.35);
      });
    }
    context.restore();
  });

  return canvasToImage(canvas, mimeType);
}

export function renderCanvasToPng(options: CanvasExportOptions): Promise<Uint8Array> {
  return renderCanvasToRaster(options, "image/png");
}

export function renderCanvasToJpeg(options: CanvasExportOptions): Promise<Uint8Array> {
  return renderCanvasToRaster(options, "image/jpeg");
}

export async function renderCanvasToSvg({ items, assets }: CanvasExportOptions): Promise<string> {
  await document.fonts.ready;

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("Canvas is unavailable");
  const bounds = getContentBounds(measureContext, items);
  if (!bounds) throw new Error("Canvas has no visible content");

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const background = resolveCssColor("var(--canvas-background, var(--color-bg-primary))");
  const resolvedColors = new Map<string, string>();
  const content = [...items].sort((a, b) => a.zIndex - b.zIndex).map((item) => {
    const transform = `translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`;
    if (item.type === "image") {
      const dataUrl = assets[item.asset];
      if (!dataUrl) throw new Error(`Missing canvas asset: ${item.asset}`);
      return `<g transform="${transform}"><image href="${escapeXml(dataUrl)}" width="${item.width}" height="${item.height}" preserveAspectRatio="none" /></g>`;
    }

    const color = resolvedColors.get(item.color) ?? resolveCssColor(item.color);
    resolvedColors.set(item.color, color);
    const lines = item.text.split("\n").map((line, index) => (
      `<tspan x="8" y="${item.fontSize + 8 + index * item.fontSize * 1.35}">${escapeXml(line)}</tspan>`
    )).join("");
    return `<g transform="${transform}"><text fill="${escapeXml(color)}" font-family="${escapeXml(item.fontFamily)}" font-size="${item.fontSize}" text-rendering="geometricPrecision">${lines}</text></g>`;
  }).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}">`,
    `<rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="${escapeXml(background)}" />`,
    content,
    "</svg>",
  ].join("\n");
}
