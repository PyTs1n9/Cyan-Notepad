import type { CanvasDoodleEraserMark, CanvasDoodleItem } from "@/types";
import { canvasDoodleMaskId, canvasDoodlePath } from "@/utils/canvasDoodle";

interface CanvasDoodleDefinitionsProps {
  items: CanvasDoodleItem[];
  maskPrefix: string;
  activeEraser?: CanvasDoodleEraserMark | null;
}

function EraserMark({ mark }: { mark: CanvasDoodleEraserMark }) {
  if (mark.points.length === 0) return null;
  if (mark.shape === "square") {
    return mark.points.map((point, index) => (
      <rect
        key={`${mark.id}-${index}`}
        x={point.x - mark.size / 2}
        y={point.y - mark.size / 2}
        width={mark.size}
        height={mark.size}
        fill="black"
        opacity={mark.opacity}
      />
    ));
  }
  if (mark.points.length === 1) {
    return (
      <circle
        cx={mark.points[0].x}
        cy={mark.points[0].y}
        r={mark.size / 2}
        fill="black"
        opacity={mark.opacity}
      />
    );
  }
  return (
    <path
      d={canvasDoodlePath(mark.points)}
      fill="none"
      stroke="black"
      strokeWidth={mark.size}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={mark.opacity}
    />
  );
}

export function CanvasDoodleDefinitions({ items, maskPrefix, activeEraser }: CanvasDoodleDefinitionsProps) {
  return items.map((item) => {
    const padding = Math.max(item.strokeWidth * 2, 4);
    return (
      <mask
        key={item.id}
        id={canvasDoodleMaskId(maskPrefix, item.id)}
        maskUnits="userSpaceOnUse"
        maskContentUnits="userSpaceOnUse"
        x={item.x - padding}
        y={item.y - padding}
        width={item.width + padding * 2}
        height={item.height + padding * 2}
        style={{ maskType: "luminance" }}
      >
        <rect
          x={item.x - padding}
          y={item.y - padding}
          width={item.width + padding * 2}
          height={item.height + padding * 2}
          fill="white"
        />
        {(item.erasures ?? []).map((mark) => <EraserMark key={mark.id} mark={mark} />)}
        {activeEraser && <EraserMark mark={activeEraser} />}
      </mask>
    );
  });
}

export function CanvasDoodleStroke({ item, maskPrefix }: { item: CanvasDoodleItem; maskPrefix: string }) {
  const mask = `url(#${canvasDoodleMaskId(maskPrefix, item.id)})`;
  if (item.points.length === 1) {
    return (
      <circle
        cx={item.points[0].x}
        cy={item.points[0].y}
        r={item.strokeWidth / 2}
        fill={item.stroke}
        opacity={item.opacity}
        mask={mask}
        pointerEvents="none"
      />
    );
  }
  return (
    <path
      d={canvasDoodlePath(item.points)}
      fill="none"
      stroke={item.stroke}
      strokeWidth={item.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={item.opacity}
      mask={mask}
      pointerEvents="none"
    />
  );
}
