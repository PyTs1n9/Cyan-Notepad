export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

interface CanvasItemBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface CanvasImageItem extends CanvasItemBase {
  type: "image";
  asset: string;
  mimeType: string;
  name: string;
}

export interface CanvasRichTextFields {
  /** Plain-text fallback used by v1 boards and quick previews. */
  text: string;
  /** TipTap-generated HTML. Missing on legacy canvas items. */
  html?: string;
  fontSize: number;
  color: string;
  fontFamily: string;
}

export interface CanvasTextItem extends CanvasItemBase, CanvasRichTextFields {
  type: "text";
}

export type CanvasShapeType = "rectangle" | "rounded" | "ellipse" | "diamond";

export interface CanvasShapeItem extends CanvasItemBase, CanvasRichTextFields {
  type: "shape";
  shape: CanvasShapeType;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export type CanvasConnectorStyle = "straight" | "orthogonal";
export type CanvasAnchor = "top" | "right" | "bottom" | "left";

export interface CanvasConnectorBinding {
  itemId: string;
  anchor: CanvasAnchor;
}

export interface CanvasConnectorItem extends CanvasItemBase {
  type: "connector";
  style: CanvasConnectorStyle;
  stroke: string;
  strokeWidth: number;
  endArrow: boolean;
  startBinding?: CanvasConnectorBinding;
  endBinding?: CanvasConnectorBinding;
}

export interface CanvasDoodlePoint {
  x: number;
  y: number;
}

export type CanvasDoodleEraserShape = "circle" | "square";

export interface CanvasDoodleEraserMark {
  id: string;
  points: CanvasDoodlePoint[];
  shape: CanvasDoodleEraserShape;
  size: number;
  /** Eraser strength from 0 to 1. */
  opacity: number;
}

export interface CanvasDoodleItem extends CanvasItemBase {
  type: "doodle";
  points: CanvasDoodlePoint[];
  stroke: string;
  strokeWidth: number;
  opacity: number;
  erasures?: CanvasDoodleEraserMark[];
}

export type CanvasRichTextItem = CanvasTextItem | CanvasShapeItem;
export type CanvasNodeItem = CanvasImageItem | CanvasTextItem | CanvasShapeItem;
export type CanvasItem = CanvasNodeItem | CanvasConnectorItem | CanvasDoodleItem;

export interface CanvasBoard {
  version: 1 | 2;
  viewport: CanvasViewport;
  items: CanvasItem[];
  updatedAt: string;
}

export interface CanvasDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyCanvasBoard(): CanvasBoard {
  return {
    version: 2,
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export function isCanvasRichTextItem(item: CanvasItem): item is CanvasRichTextItem {
  return item.type === "text" || item.type === "shape";
}

export function isCanvasNodeItem(item: CanvasItem): item is CanvasNodeItem {
  return item.type === "image" || item.type === "text" || item.type === "shape";
}

/** Upgrade legacy boards without rewriting their text until the next save. */
export function normalizeCanvasBoard(board: CanvasBoard): CanvasBoard {
  return {
    ...board,
    version: 2,
    viewport: {
      x: Number.isFinite(board.viewport?.x) ? board.viewport.x : 0,
      y: Number.isFinite(board.viewport?.y) ? board.viewport.y : 0,
      zoom: Number.isFinite(board.viewport?.zoom) ? board.viewport.zoom : 1,
    },
    items: Array.isArray(board.items) ? board.items : [],
    updatedAt: board.updatedAt || new Date().toISOString(),
  };
}
