import type { CanvasDoodleEraserMark, CanvasDoodlePoint } from "@/types";

export function canvasDoodlePath(points: readonly CanvasDoodlePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

export function appendCanvasDoodlePoint(
  points: readonly CanvasDoodlePoint[],
  next: CanvasDoodlePoint,
  maximumStep: number,
): CanvasDoodlePoint[] {
  const previous = points[points.length - 1];
  if (!previous) return [next];
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  if (distance < 0.35) return [...points];
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, maximumStep)));
  const appended = [...points];
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    appended.push({
      x: previous.x + (next.x - previous.x) * ratio,
      y: previous.y + (next.y - previous.y) * ratio,
    });
  }
  return appended;
}

export function getCanvasDoodleBounds(points: readonly CanvasDoodlePoint[], padding: number) {
  const minX = Math.min(...points.map((point) => point.x)) - padding;
  const minY = Math.min(...points.map((point) => point.y)) - padding;
  const maxX = Math.max(...points.map((point) => point.x)) + padding;
  const maxY = Math.max(...points.map((point) => point.y)) + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function canvasDoodleMaskId(prefix: string, itemId: string): string {
  return `${prefix}-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function canvasDoodleEraserMarkup(mark: CanvasDoodleEraserMark): string {
  if (mark.points.length === 0) return "";
  if (mark.shape === "square") {
    return mark.points.map((point) => (
      `<rect x="${point.x - mark.size / 2}" y="${point.y - mark.size / 2}" width="${mark.size}" height="${mark.size}" fill="black" opacity="${mark.opacity}" />`
    )).join("");
  }
  if (mark.points.length === 1) {
    const point = mark.points[0];
    return `<circle cx="${point.x}" cy="${point.y}" r="${mark.size / 2}" fill="black" opacity="${mark.opacity}" />`;
  }
  return `<path d="${canvasDoodlePath(mark.points)}" fill="none" stroke="black" stroke-width="${mark.size}" stroke-linecap="round" stroke-linejoin="round" opacity="${mark.opacity}" />`;
}
