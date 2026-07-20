export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasImageItem {
  id: string;
  type: "image";
  asset: string;
  mimeType: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface CanvasTextItem {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  rotation: number;
  zIndex: number;
}

export type CanvasItem = CanvasImageItem | CanvasTextItem;

export interface CanvasBoard {
  version: 1;
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
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [],
    updatedAt: new Date().toISOString(),
  };
}
