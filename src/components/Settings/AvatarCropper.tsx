import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Move, ZoomIn, ZoomOut, X } from "lucide-react";
import type { LangType } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

const VIEWPORT_SIZE = 320;
const CROP_SIZE = 236;
const OUTPUT_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface AvatarCropperProps {
  file: File;
  lang: LangType;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (avatarDataUrl: string) => Promise<void>;
}

interface ImageSize {
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getBaseScale(imageSize: ImageSize): number {
  return Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height);
}

function clampOffset(offset: Point, imageSize: ImageSize, zoom: number): Point {
  const scale = getBaseScale(imageSize) * zoom;
  const maxX = Math.max(0, (imageSize.width * scale - CROP_SIZE) / 2);
  const maxY = Math.max(0, (imageSize.height * scale - CROP_SIZE) / 2);

  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

export default function AvatarCropper({
  file,
  lang,
  saving,
  onCancel,
  onConfirm,
}: AvatarCropperProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageSize(null);
    setImageFailed(false);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const updateZoom = useCallback((nextZoom: number) => {
    if (!imageSize) return;
    const normalizedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(normalizedZoom);
    setOffset((current) => clampOffset(current, imageSize, normalizedZoom));
  }, [imageSize]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize || saving || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !imageSize) return;
    setOffset(clampOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, imageSize, zoom));
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image || !imageSize || saving) return;

    const scale = getBaseScale(imageSize) * zoom;
    const sourceSize = CROP_SIZE / scale;
    const sourceX = clamp(
      imageSize.width / 2 - offset.x / scale - sourceSize / 2,
      0,
      imageSize.width - sourceSize,
    );
    const sourceY = clamp(
      imageSize.height / 2 - offset.y / scale - sourceSize / 2,
      0,
      imageSize.height - sourceSize,
    );

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    await onConfirm(canvas.toDataURL("image/jpeg", 0.88));
  };

  const baseScale = imageSize ? getBaseScale(imageSize) : 1;
  const displayWidth = imageSize ? imageSize.width * baseScale * zoom : 0;
  const displayHeight = imageSize ? imageSize.height * baseScale * zoom : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t(lang, "avatarCropCancel")}
        className="absolute inset-0 bg-black/55"
        disabled={saving}
        onClick={onCancel}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        className="relative w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="avatar-crop-title" className="text-base font-semibold text-text-primary">
              {t(lang, "avatarCropTitle")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              {t(lang, "avatarCropHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label={t(lang, "avatarCropCancel")}
            title={t(lang, "avatarCropCancel")}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-4">
          <div
            className={`relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-bg-secondary ${imageSize && !saving ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onWheel={(event) => {
              event.preventDefault();
              updateZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12));
            }}
          >
            {imageUrl && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                onError={() => setImageFailed(true)}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}

            {!imageSize && !imageFailed && (
              <div className="absolute inset-0 flex items-center justify-center text-text-muted">
                <LoaderCircle size={24} className="animate-spin" />
              </div>
            )}
            {imageFailed && (
              <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-danger">
                {t(lang, "avatarCropLoadFailed")}
              </div>
            )}

            <div
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.56)]"
              style={{
                width: CROP_SIZE,
                height: CROP_SIZE,
                transform: "translate(-50%, -50%)",
              }}
            />
            {imageSize && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-sm">
                <Move size={12} />
                {t(lang, "avatarCropDragHint")}
              </div>
            )}
          </div>

          <div className="mx-auto mt-4 flex w-80 items-center gap-3">
            <button
              type="button"
              onClick={() => updateZoom(zoom - 0.15)}
              disabled={!imageSize || saving || zoom <= MIN_ZOOM}
              aria-label={t(lang, "avatarCropZoomOut")}
              title={t(lang, "avatarCropZoomOut")}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <ZoomOut size={17} />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(event) => updateZoom(Number(event.target.value))}
              disabled={!imageSize || saving}
              aria-label={t(lang, "avatarCropZoom")}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => updateZoom(zoom + 0.15)}
              disabled={!imageSize || saving || zoom >= MAX_ZOOM}
              aria-label={t(lang, "avatarCropZoomIn")}
              title={t(lang, "avatarCropZoomIn")}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            >
              <ZoomIn size={17} />
            </button>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border bg-bg-secondary/25 px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {t(lang, "avatarCropCancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!imageSize || imageFailed || saving}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
            {saving ? t(lang, "personalSaving") : t(lang, "avatarCropConfirm")}
          </button>
        </footer>
      </section>
    </div>
  );
}
