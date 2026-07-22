import type {
  CanvasAnchor,
  CanvasConnectorItem,
  CanvasItem,
  CanvasNodeItem,
} from "@/types";
import { isCanvasNodeItem } from "@/types/canvas";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasConnectorGeometry {
  start: CanvasPoint;
  end: CanvasPoint;
  path: string;
}

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getCanvasItemCenter(item: CanvasNodeItem): CanvasPoint {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

export function getCanvasAnchorPoint(item: CanvasNodeItem, anchor: CanvasAnchor): CanvasPoint {
  switch (anchor) {
    case "top": return { x: item.x + item.width / 2, y: item.y };
    case "right": return { x: item.x + item.width, y: item.y + item.height / 2 };
    case "bottom": return { x: item.x + item.width / 2, y: item.y + item.height };
    case "left": return { x: item.x, y: item.y + item.height / 2 };
  }
}

export function chooseCanvasAnchors(
  startItem: CanvasNodeItem,
  endItem: CanvasNodeItem,
): { start: CanvasAnchor; end: CanvasAnchor } {
  const start = getCanvasItemCenter(startItem);
  const end = getCanvasItemCenter(endItem);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontalWeight = Math.abs(dx) / Math.max(1, (startItem.width + endItem.width) / 2);
  const verticalWeight = Math.abs(dy) / Math.max(1, (startItem.height + endItem.height) / 2);
  if (horizontalWeight >= verticalWeight) {
    return dx >= 0 ? { start: "right", end: "left" } : { start: "left", end: "right" };
  }
  return dy >= 0 ? { start: "bottom", end: "top" } : { start: "top", end: "bottom" };
}

function orthogonalPath(start: CanvasPoint, end: CanvasPoint): string {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx >= dy) {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}`;
  }
  const middleY = (start.y + end.y) / 2;
  return `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`;
}

export function resolveCanvasConnector(
  connector: CanvasConnectorItem,
  items: CanvasItem[],
): CanvasConnectorGeometry {
  const startItem = connector.startBinding
    ? items.find((item): item is CanvasNodeItem => item.id === connector.startBinding?.itemId && isCanvasNodeItem(item))
    : undefined;
  const endItem = connector.endBinding
    ? items.find((item): item is CanvasNodeItem => item.id === connector.endBinding?.itemId && isCanvasNodeItem(item))
    : undefined;
  const start = startItem && connector.startBinding
    ? getCanvasAnchorPoint(startItem, connector.startBinding.anchor)
    : { x: connector.x, y: connector.y };
  const end = endItem && connector.endBinding
    ? getCanvasAnchorPoint(endItem, connector.endBinding.anchor)
    : { x: connector.x + connector.width, y: connector.y + connector.height };
  return {
    start,
    end,
    path: connector.style === "orthogonal"
      ? orthogonalPath(start, end)
      : `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
  };
}

export function getCanvasItemBounds(item: CanvasItem, items: CanvasItem[]): CanvasBounds {
  if (item.type === "connector") {
    const { start, end } = resolveCanvasConnector(item, items);
    const margin = Math.max(6, item.strokeWidth * 3);
    return {
      minX: Math.min(start.x, end.x) - margin,
      minY: Math.min(start.y, end.y) - margin,
      maxX: Math.max(start.x, end.x) + margin,
      maxY: Math.max(start.y, end.y) + margin,
    };
  }
  return {
    minX: item.x,
    minY: item.y,
    maxX: item.x + item.width,
    maxY: item.y + item.height,
  };
}
