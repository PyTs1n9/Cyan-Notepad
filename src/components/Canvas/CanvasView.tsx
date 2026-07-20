import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Hand,
  ImagePlus,
  Maximize2,
  MousePointer2,
  PanelRight,
  Plus,
  Redo2,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasDocument, CanvasImageItem, CanvasItem, CanvasTextItem } from "@/types";
import { createEmptyCanvasBoard } from "@/types/canvas";
import {
  deleteCanvasBoard,
  loadCanvasAsset,
  loadCanvasBoard,
  loadCanvasList,
  saveCanvasAsset,
  saveCanvasBoard,
  saveCanvasList,
} from "@/utils/canvasStorage";
import { renderCanvasToJpeg, renderCanvasToPng, renderCanvasToSvg } from "@/utils/canvasExport";
import { t, tWithParams } from "@/utils/i18n";

type CanvasTool = "select" | "pan" | "text";
type SaveState = "saved" | "saving";

interface Point {
  x: number;
  y: number;
}

interface PanInteraction {
  kind: "pan";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

interface ItemInteraction {
  kind: "drag" | "resize";
  pointerId: number;
  id: string;
  startWorld: Point;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  updates: Partial<CanvasItem>;
}

type Interaction = PanInteraction | ItemInteraction;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function extensionFromName(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "png";
}

function mimeFromName(name: string): string {
  switch (extensionFromName(name)) {
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
    default:
      return "image/png";
  }
}

function makeId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const toolbarButton = "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40";

export default function CanvasView() {
  const lang = useSettingsStore((state) => state.lang);
  const {
    board,
    selectedId,
    loaded,
    history,
    future,
    loadBoard,
    setSelectedId,
    setViewport,
    addItem,
    updateItem,
    moveLayer,
    removeItem,
    undo,
    redo,
  } = useCanvasStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const lastTextClickRef = useRef<{ id: string; time: number } | null>(null);
  const spaceHeldRef = useRef(false);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [draftItems, setDraftItems] = useState<Record<string, Partial<CanvasItem>>>({});
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [exporting, setExporting] = useState(false);
  const [lastPointer, setLastPointer] = useState<Point | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [canvases, setCanvases] = useState<CanvasDocument[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [canvasListLoaded, setCanvasListLoaded] = useState(false);
  const [switchingCanvas, setSwitchingCanvas] = useState(false);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState("");
  const [renamingCanvasId, setRenamingCanvasId] = useState<string | null>(null);
  const [renamingCanvasName, setRenamingCanvasName] = useState("");
  const [deletingCanvasId, setDeletingCanvasId] = useState<string | null>(null);
  const newCanvasInputRef = useRef<HTMLInputElement>(null);
  const renameCanvasInputRef = useRef<HTMLInputElement>(null);

  const hasUndo = history.length > 0;
  const hasRedo = future.length > 0;
  const orderedItems = useMemo(() => [...board.items].sort((a, b) => a.zIndex - b.zIndex), [board.items]);
  const selectedLayerIndex = selectedId ? orderedItems.findIndex((item) => item.id === selectedId) : -1;
  const canMoveLayerDown = selectedLayerIndex > 0;
  const canMoveLayerUp = selectedLayerIndex >= 0 && selectedLayerIndex < orderedItems.length - 1;

  useEffect(() => {
    if (!creatingCanvas) return;
    const frame = window.requestAnimationFrame(() => newCanvasInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [creatingCanvas]);

  useEffect(() => {
    if (!renamingCanvasId) return;
    const frame = window.requestAnimationFrame(() => {
      renameCanvasInputRef.current?.focus();
      renameCanvasInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renamingCanvasId]);

  const getWorldPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - board.viewport.x) / board.viewport.zoom,
      y: (clientY - rect.top - board.viewport.y) / board.viewport.zoom,
    };
  }, [board.viewport]);

  const getViewportCenter = useCallback((): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 120, y: 100 };
    const rect = svg.getBoundingClientRect();
    return getWorldPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [getWorldPoint]);

  useEffect(() => {
    let cancelled = false;
    void loadCanvasList().then(async (storedCanvases) => {
      if (cancelled) return;
      const firstCanvas = storedCanvases[0];
      setCanvases(storedCanvases);
      if (!firstCanvas) {
        loadBoard(createEmptyCanvasBoard());
        setCanvasListLoaded(true);
        return;
      }
      setActiveCanvasId(firstCanvas.id);
      const storedBoard = await loadCanvasBoard(firstCanvas.id);
      if (!cancelled) {
        loadBoard(storedBoard ?? createEmptyCanvasBoard());
        setCanvasListLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadBoard]);

  useEffect(() => {
    if (!loaded || !canvasListLoaded || !activeCanvasId || switchingCanvas) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void saveCanvasBoard(board, activeCanvasId).then(() => setSaveState("saved"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeCanvasId, board, canvasListLoaded, loaded, switchingCanvas]);

  useEffect(() => {
    let cancelled = false;
    const imageItems = board.items.filter((item): item is CanvasImageItem => item.type === "image");
    void Promise.all(imageItems.map(async (item) => {
      if (assets[item.asset]) return null;
      const loadedAsset = await loadCanvasAsset(item.asset);
      return loadedAsset ? { asset: item.asset, dataUrl: loadedAsset.dataUrl } : null;
    })).then((loadedAssets) => {
      if (cancelled) return;
      const nextAssets = loadedAssets.reduce<Record<string, string>>((result, asset) => {
        if (asset) result[asset.asset] = asset.dataUrl;
        return result;
      }, {});
      if (Object.keys(nextAssets).length > 0) {
        setAssets((current) => ({ ...current, ...nextAssets }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assets, board.items]);

  const getDisplayItem = useCallback((item: CanvasItem): CanvasItem => ({
    ...item,
    ...(draftItems[item.id] ?? {}),
  } as CanvasItem), [draftItems]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      const nextSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setCanvasSize((current) => current.width === nextSize.width && current.height === nextSize.height ? current : nextSize);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const minimap = useMemo(() => {
    const items = board.items.map(getDisplayItem);
    const minItemX = items.length > 0 ? Math.min(...items.map((item) => item.x)) : 0;
    const minItemY = items.length > 0 ? Math.min(...items.map((item) => item.y)) : 0;
    const maxItemX = items.length > 0 ? Math.max(...items.map((item) => item.x + item.width)) : 900;
    const maxItemY = items.length > 0 ? Math.max(...items.map((item) => item.y + item.height)) : 560;
    const contentWidth = Math.max(1, maxItemX - minItemX);
    const contentHeight = Math.max(1, maxItemY - minItemY);
    const padding = Math.max(48, Math.max(contentWidth, contentHeight) * 0.08);
    const viewBox = {
      x: minItemX - padding,
      y: minItemY - padding,
      width: contentWidth + padding * 2,
      height: contentHeight + padding * 2,
    };
    const visibleWidth = canvasSize.width > 0 ? canvasSize.width / board.viewport.zoom : contentWidth;
    const visibleHeight = canvasSize.height > 0 ? canvasSize.height / board.viewport.zoom : contentHeight;
    return {
      items,
      viewBox,
      viewport: {
        x: -board.viewport.x / board.viewport.zoom,
        y: -board.viewport.y / board.viewport.zoom,
        width: visibleWidth,
        height: visibleHeight,
      },
    };
  }, [board.items, board.viewport, canvasSize, getDisplayItem]);

  const centerViewportOnPoint = useCallback((point: Point) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setViewport({
      zoom: board.viewport.zoom,
      x: rect.width / 2 - point.x * board.viewport.zoom,
      y: rect.height / 2 - point.y * board.viewport.zoom,
    });
  }, [board.viewport.zoom, setViewport]);

  const handleMinimapItemClick = useCallback((event: React.MouseEvent<SVGGElement>, rawItem: CanvasItem) => {
    event.stopPropagation();
    const item = getDisplayItem(rawItem);
    setSelectedId(item.id);
    centerViewportOnPoint({
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
    });
  }, [centerViewportOnPoint, getDisplayItem, setSelectedId]);

  const switchCanvas = useCallback(async (canvasId: string) => {
    if (!canvasId || canvasId === activeCanvasId || switchingCanvas || !loaded) return;
    setSwitchingCanvas(true);
    try {
      if (activeCanvasId) {
        await saveCanvasBoard(useCanvasStore.getState().board, activeCanvasId);
      }
      const storedBoard = await loadCanvasBoard(canvasId);
      setActiveCanvasId(canvasId);
      setAssets({});
      setDraftItems({});
      setEditingTextId(null);
      setCreatingCanvas(false);
      setNewCanvasName("");
      setRenamingCanvasId(null);
      setRenamingCanvasName("");
      setDeletingCanvasId(null);
      loadBoard(storedBoard ?? createEmptyCanvasBoard());
      setCanvasMenuOpen(false);
    } finally {
      setSwitchingCanvas(false);
    }
  }, [activeCanvasId, loadBoard, switchingCanvas]);

  const createCanvas = useCallback(async () => {
    const name = newCanvasName.trim();
    if (!name || switchingCanvas || !loaded) return;

    const now = new Date().toISOString();
    const canvas: CanvasDocument = {
      id: makeId(),
      name,
      createdAt: now,
      updatedAt: now,
    };
    const nextCanvases = [...canvases, canvas];
    setSwitchingCanvas(true);
    try {
      if (activeCanvasId) {
        await saveCanvasBoard(useCanvasStore.getState().board, activeCanvasId);
      }
      const emptyBoard = createEmptyCanvasBoard();
      await saveCanvasBoard(emptyBoard, canvas.id);
      await saveCanvasList(nextCanvases);
      setCanvases(nextCanvases);
      setActiveCanvasId(canvas.id);
      setAssets({});
      setDraftItems({});
      setEditingTextId(null);
      loadBoard(emptyBoard);
      setCreatingCanvas(false);
      setNewCanvasName("");
      setRenamingCanvasId(null);
      setRenamingCanvasName("");
      setDeletingCanvasId(null);
      setCanvasMenuOpen(false);
    } finally {
      setSwitchingCanvas(false);
    }
  }, [activeCanvasId, canvases, loadBoard, loaded, newCanvasName, switchingCanvas]);

  const beginRenameCanvas = useCallback((canvas: CanvasDocument) => {
    if (switchingCanvas || !loaded) return;
    setCreatingCanvas(false);
    setNewCanvasName("");
    setDeletingCanvasId(null);
    setRenamingCanvasId(canvas.id);
    setRenamingCanvasName(canvas.name);
    setCanvasMenuOpen(true);
  }, [loaded, switchingCanvas]);

  const cancelRenameCanvas = useCallback(() => {
    setRenamingCanvasId(null);
    setRenamingCanvasName("");
  }, []);

  const renameCanvas = useCallback(async () => {
    if (!renamingCanvasId || switchingCanvas || !loaded) return;
    const name = renamingCanvasName.trim();
    if (!name) return;
    const current = canvases.find((canvas) => canvas.id === renamingCanvasId);
    if (!current) return;
    if (current.name === name) {
      cancelRenameCanvas();
      return;
    }
    const nextCanvases = canvases.map((canvas) => (
      canvas.id === renamingCanvasId
        ? { ...canvas, name, updatedAt: new Date().toISOString() }
        : canvas
    ));
    await saveCanvasList(nextCanvases);
    setCanvases(nextCanvases);
    cancelRenameCanvas();
  }, [canvases, cancelRenameCanvas, loaded, renamingCanvasId, renamingCanvasName, switchingCanvas]);

  const requestDeleteCanvas = useCallback((canvasId: string) => {
    if (switchingCanvas || !loaded) return;
    setCreatingCanvas(false);
    setNewCanvasName("");
    setRenamingCanvasId(null);
    setRenamingCanvasName("");
    setDeletingCanvasId((current) => current === canvasId ? null : canvasId);
    setCanvasMenuOpen(true);
  }, [loaded, switchingCanvas]);

  const closeCanvasMenu = useCallback(() => {
    setCanvasMenuOpen(false);
    setCreatingCanvas(false);
    setNewCanvasName("");
    setRenamingCanvasId(null);
    setRenamingCanvasName("");
    setDeletingCanvasId(null);
  }, []);

  const toggleCanvasMenu = useCallback(() => {
    if (canvasMenuOpen) {
      closeCanvasMenu();
    } else {
      setCanvasMenuOpen(true);
    }
  }, [canvasMenuOpen, closeCanvasMenu]);

  const removeCanvas = useCallback(async (canvasId: string) => {
    const canvas = canvases.find((candidate) => candidate.id === canvasId);
    if (!canvas) return;

    const nextCanvases = canvases.filter((candidate) => candidate.id !== canvasId);
    setSwitchingCanvas(true);
    try {
      if (canvasId === activeCanvasId && activeCanvasId) {
        await saveCanvasBoard(useCanvasStore.getState().board, activeCanvasId);
      }
      setCreatingCanvas(false);
      setNewCanvasName("");
      setRenamingCanvasId(null);
      setRenamingCanvasName("");
      setDeletingCanvasId(null);
      await deleteCanvasBoard(canvasId);
      await saveCanvasList(nextCanvases);
      setCanvases(nextCanvases);
      if (canvasId === activeCanvasId) {
        const nextActive = nextCanvases[Math.max(0, canvases.findIndex((candidate) => candidate.id === canvasId) - 1)] ?? nextCanvases[0];
        setAssets({});
        setDraftItems({});
        setEditingTextId(null);
        if (nextActive) {
          const storedBoard = await loadCanvasBoard(nextActive.id);
          setActiveCanvasId(nextActive.id);
          loadBoard(storedBoard ?? createEmptyCanvasBoard());
        } else {
          setActiveCanvasId(null);
          loadBoard(createEmptyCanvasBoard());
        }
      }
      setCanvasMenuOpen(false);
    } finally {
      setSwitchingCanvas(false);
    }
  }, [activeCanvasId, canvases, loadBoard]);

  const updateViewportAt = useCallback((clientX: number, clientY: number, zoom: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const oldWorldX = (clientX - rect.left - board.viewport.x) / board.viewport.zoom;
    const oldWorldY = (clientY - rect.top - board.viewport.y) / board.viewport.zoom;
    setViewport({
      zoom,
      x: clientX - rect.left - oldWorldX * zoom,
      y: clientY - rect.top - oldWorldY * zoom,
    });
  }, [board.viewport, setViewport]);

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    updateViewportAt(rect.left + rect.width / 2, rect.top + rect.height / 2, clamp(board.viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM));
  }, [board.viewport.zoom, updateViewportAt]);

  const fitCanvas = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || board.items.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const rect = svg.getBoundingClientRect();
    const items = board.items.map(getDisplayItem);
    const minX = Math.min(...items.map((item) => item.x));
    const minY = Math.min(...items.map((item) => item.y));
    const maxX = Math.max(...items.map((item) => item.x + item.width));
    const maxY = Math.max(...items.map((item) => item.y + item.height));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const zoom = clamp(Math.min((rect.width - 80) / contentWidth, (rect.height - 80) / contentHeight), MIN_ZOOM, 2.5);
    setViewport({
      zoom,
      x: rect.width / 2 - (minX + maxX) / 2 * zoom,
      y: rect.height / 2 - (minY + maxY) / 2 * zoom,
    });
  }, [board.items, getDisplayItem, setViewport]);

  const startEditingText = useCallback((item: CanvasTextItem) => {
    setSelectedId(item.id);
    setEditingTextId(item.id);
    setEditingText(item.text);
  }, [setSelectedId]);

  const finishEditingText = useCallback((cancel = false) => {
    if (!editingTextId) return;
    if (!cancel) {
      updateItem(editingTextId, { text: editingText.trim() || "Text" });
    }
    setEditingTextId(null);
  }, [editingText, editingTextId, updateItem]);

  useEffect(() => {
    if (!editingTextId) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = textEditorRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingTextId]);

  const addTextAt = useCallback((point: Point) => {
    const item: CanvasTextItem = {
      id: makeId(),
      type: "text",
      text: "Text",
      x: point.x,
      y: point.y,
      width: 260,
      height: 86,
      fontSize: 22,
      color: "var(--color-text-primary)",
      fontFamily: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
      rotation: 0,
      zIndex: board.items.length,
    };
    addItem(item);
    startEditingText(item);
    setTool("select");
  }, [addItem, board.items.length, startEditingText]);

  const addImageBytes = useCallback(async (data: Uint8Array, name: string, mimeType: string) => {
    if (!mimeType.startsWith("image/")) return;
    const extension = extensionFromName(name);
    const dataUrl = `data:${mimeType};base64,${bytesToBase64(data)}`;
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }));
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: image.naturalWidth || 640, height: image.naturalHeight || 420 });
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: 640, height: 420 });
      };
      image.src = objectUrl;
    });
    const asset = await saveCanvasAsset(data, extension);
    const maxWidth = 620;
    const scale = Math.min(1, maxWidth / dimensions.width);
    const width = Math.max(120, Math.round(dimensions.width * scale));
    const height = Math.max(80, Math.round(dimensions.height * scale));
    const center = getViewportCenter();
    const item: CanvasImageItem = {
      id: makeId(),
      type: "image",
      asset,
      mimeType,
      name: name || "image",
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      rotation: 0,
      zIndex: board.items.length,
    };
    setAssets((current) => ({ ...current, [asset]: dataUrl }));
    addItem(item);
    setSelectedId(item.id);
    setTool("select");
  }, [addItem, board.items.length, getViewportCenter, setSelectedId]);

  const importImageFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await addImageBytes(new Uint8Array(await file.arrayBuffer()), file.name || "pasted-image.png", file.type);
      }
    }
  }, [addImageBytes]);

  const handleChooseImage = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"] }],
    });
    const paths = selected ? (Array.isArray(selected) ? selected : [selected]) : [];
    for (const path of paths) {
      const data = new Uint8Array(await readFile(path));
      const name = path.split(/[\\/]/).pop() || "image.png";
      await addImageBytes(data, name, mimeFromName(name));
    }
  }, [addImageBytes]);

  const handleExport = useCallback(async () => {
    if (board.items.length === 0 || exporting) return;
    const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId);
    const safeName = (activeCanvas?.name || t(lang, "canvas"))
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "canvas";
    setExporting(true);
    try {
      const exportPath = await save({
        defaultPath: `${safeName}.png`,
        filters: [
          { name: "PNG", extensions: ["png"] },
          { name: "JPEG", extensions: ["jpg", "jpeg"] },
          { name: "SVG", extensions: ["svg"] },
        ],
      });
      if (!exportPath) return;

      const exportAssets = { ...assets };
      await Promise.all(board.items.filter((item): item is CanvasImageItem => item.type === "image").map(async (item) => {
        if (exportAssets[item.asset]) return;
        const loadedAsset = await loadCanvasAsset(item.asset);
        if (loadedAsset) exportAssets[item.asset] = loadedAsset.dataUrl;
      }));
      const exportItems = board.items.map((item) => {
        const displayItem = getDisplayItem(item);
        if (displayItem.type === "text" && displayItem.id === editingTextId) {
          return { ...displayItem, text: editingText.trim() || "Text" };
        }
        return displayItem;
      });
      if (exportPath.toLowerCase().endsWith(".svg")) {
        await writeFile(exportPath, new TextEncoder().encode(await renderCanvasToSvg({ items: exportItems, assets: exportAssets })));
      } else if (/\.jpe?g$/i.test(exportPath)) {
        await writeFile(exportPath, await renderCanvasToJpeg({ items: exportItems, assets: exportAssets }));
      } else {
        await writeFile(exportPath, await renderCanvasToPng({ items: exportItems, assets: exportAssets }));
      }
    } catch (error) {
      console.error("Failed to export canvas:", error);
    } finally {
      setExporting(false);
    }
  }, [activeCanvasId, assets, board.items, canvases, editingText, editingTextId, exporting, getDisplayItem, lang]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        event.preventDefault();
        await importImageFiles([file]);
        return;
      }
    }
    const text = event.clipboardData?.getData("text/plain")?.trim();
    if (text) {
      event.preventDefault();
      const point = lastPointer ?? getViewportCenter();
      const item: CanvasTextItem = {
        id: makeId(),
        type: "text",
        text,
        x: point.x,
        y: point.y,
        width: 300,
        height: 100,
        fontSize: 18,
        color: "var(--color-text-primary)",
        fontFamily: "Segoe UI, PingFang SC, Microsoft YaHei, sans-serif",
        rotation: 0,
        zIndex: board.items.length,
      };
      addItem(item);
      startEditingText(item);
    }
  }, [addItem, board.items.length, getViewportCenter, importImageFiles, lastPointer, startEditingText]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => { void handlePaste(event); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeldRef.current = true;
      const target = event.target;
      const isTextInput = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
      if (isTextInput) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key === "Delete" && selectedId) {
        event.preventDefault();
        removeItem(selectedId);
      } else if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeldRef.current = false;
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handlePaste, redo, removeItem, selectedId, setSelectedId, undo]);

  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    interactionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: board.viewport.x,
      startY: board.viewport.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startItemDrag = (event: React.PointerEvent<SVGGElement>, item: CanvasItem) => {
    event.stopPropagation();
    if (tool === "text") {
      if (item.type === "text") {
        event.preventDefault();
        startEditingText(item);
      }
      return;
    }
    if (tool !== "select") return;
    if (item.type === "text") {
      const now = performance.now();
      const previous = lastTextClickRef.current;
      if (previous?.id === item.id && now - previous.time < 420) {
        event.preventDefault();
        lastTextClickRef.current = null;
        startEditingText(item);
        return;
      }
      lastTextClickRef.current = { id: item.id, time: now };
    }
    setSelectedId(item.id);
    const point = getWorldPoint(event.clientX, event.clientY);
    interactionRef.current = {
      kind: "drag",
      pointerId: event.pointerId,
      id: item.id,
      startWorld: point,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
      startHeight: item.height,
      updates: {},
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startResize = (event: React.PointerEvent<SVGRectElement>, item: CanvasItem) => {
    event.stopPropagation();
    if (tool !== "select") return;
    const point = getWorldPoint(event.clientX, event.clientY);
    interactionRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      id: item.id,
      startWorld: point,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
      startHeight: item.height,
      updates: {},
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "pan") {
      setViewport({
        x: interaction.startX + event.clientX - interaction.startClientX,
        y: interaction.startY + event.clientY - interaction.startClientY,
        zoom: board.viewport.zoom,
      });
      return;
    }
    const point = getWorldPoint(event.clientX, event.clientY);
    if (interaction.kind === "drag") {
      interaction.updates = {
        x: interaction.startX + point.x - interaction.startWorld.x,
        y: interaction.startY + point.y - interaction.startWorld.y,
      };
    } else {
      const width = Math.max(48, interaction.startWidth + point.x - interaction.startWorld.x);
      const height = Math.max(36, interaction.startHeight + point.y - interaction.startWorld.y);
      interaction.updates = { width, height };
    }
    setDraftItems((current) => ({ ...current, [interaction.id]: interaction.updates }));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind !== "pan" && Object.keys(interaction.updates).length > 0) {
      updateItem(interaction.id, interaction.updates);
      setDraftItems((current) => {
        const next = { ...current };
        delete next[interaction.id];
        return next;
      });
    }
    interactionRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const handleRootPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = getWorldPoint(event.clientX, event.clientY);
    setLastPointer(point);
    if (event.button === 1 || tool === "pan" || spaceHeldRef.current) {
      startPan(event);
      return;
    }
    if (tool === "text") {
      event.preventDefault();
      addTextAt(point);
      return;
    }
    if (event.target === event.currentTarget || event.target instanceof SVGRectElement) {
      setSelectedId(null);
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const selectedItem = selectedId
      ? board.items.find((item) => item.id === selectedId)
      : null;

    // Ctrl/Cmd + wheel is reserved for zooming the whole canvas. Without the
    // modifier, wheel-resizing applies only to the currently selected object.
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      updateViewportAt(event.clientX, event.clientY, clamp(board.viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM));
      return;
    }

    if (!selectedItem) return;

    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    if (selectedItem.type === "text") {
      updateItem(selectedItem.id, { fontSize: clamp(selectedItem.fontSize * factor, 8, 256) });
      return;
    }

    const nextWidth = clamp(selectedItem.width * factor, 48, 4096);
    const nextHeight = clamp(selectedItem.height * (nextWidth / selectedItem.width), 36, 4096);
    const centerX = selectedItem.x + selectedItem.width / 2;
    const centerY = selectedItem.y + selectedItem.height / 2;
    updateItem(selectedItem.id, {
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const handleDrop = (event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    void importImageFiles(Array.from(event.dataTransfer.files));
  };

  const renderSelection = (item: CanvasItem) => {
    if (selectedId !== item.id) return null;
    return (
      <>
        <rect x={-2} y={-2} width={item.width + 4} height={item.height + 4} fill="none" stroke="var(--color-accent)" strokeWidth={2 / board.viewport.zoom} strokeDasharray={`${5 / board.viewport.zoom} ${3 / board.viewport.zoom}`} pointerEvents="none" />
        <rect
          x={item.width - 7}
          y={item.height - 7}
          width={14}
          height={14}
          rx={2}
          fill="var(--color-accent)"
          stroke="var(--color-bg-primary)"
          strokeWidth={2 / board.viewport.zoom}
          className="cursor-nwse-resize"
          onPointerDown={(event) => startResize(event, item)}
        />
      </>
    );
  };

  const renderItem = (rawItem: CanvasItem) => {
    const item = getDisplayItem(rawItem);
    const transform = `translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})`;
    if (item.type === "image") {
      return (
        <g key={item.id} transform={transform} onPointerDown={(event) => startItemDrag(event, item)}>
          <rect width={item.width} height={item.height} fill="var(--color-bg-secondary)" opacity={assets[item.asset] ? 0 : 0.8} />
          {assets[item.asset] && <image href={assets[item.asset]} width={item.width} height={item.height} preserveAspectRatio="none" style={{ userSelect: "none" }} />}
          {renderSelection(item)}
        </g>
      );
    }
    return (
      <g key={item.id} transform={transform} onPointerDown={(event) => startItemDrag(event, item)}>
        <rect width={item.width} height={item.height} fill="transparent" />
        <text x={8} y={item.fontSize + 8} fill={item.color} fontFamily={item.fontFamily} fontSize={item.fontSize} pointerEvents="none">
          {item.text.split("\n").map((line, index) => (
            <tspan key={`${item.id}-${index}`} x={8} dy={index === 0 ? 0 : item.fontSize * 1.35}>{line}</tspan>
          ))}
        </text>
        {renderSelection(item)}
      </g>
    );
  };

  const toolTitle = (name: string) => `${t(lang, "canvas")}: ${name}`;
  const zoomLabel = `${Math.round(board.viewport.zoom * 100)}%`;
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId);
  const editingTextItem = editingTextId
    ? orderedItems.find((item): item is CanvasTextItem => item.id === editingTextId && item.type === "text") ?? null
    : null;

  return (
    <section className="canvas-surface flex min-h-0 flex-1 flex-col bg-bg-primary">
      <div className="flex h-11 flex-shrink-0 items-center gap-1 border-b border-border bg-bg-secondary px-3">
        <div className="mr-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <ImagePlus size={16} className="text-accent" />
          <span>{activeCanvas?.name || t(lang, "canvas")}</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <button type="button" className={`${toolbarButton} ${tool === "select" ? "bg-accent text-white hover:bg-accent-hover hover:text-white" : ""}`} onClick={() => setTool("select")} title={toolTitle(t(lang, "canvasSelect"))}>
          <MousePointer2 size={15} />
          <span className="hidden sm:inline">{t(lang, "canvasSelect")}</span>
        </button>
        <button type="button" className={`${toolbarButton} ${tool === "pan" ? "bg-accent text-white hover:bg-accent-hover hover:text-white" : ""}`} onClick={() => setTool("pan")} title={toolTitle(t(lang, "canvasPan"))}>
          <Hand size={15} />
          <span className="hidden sm:inline">{t(lang, "canvasPan")}</span>
        </button>
        <button type="button" className={toolbarButton} onClick={() => void handleChooseImage()} title={t(lang, "canvasAddImage")}>
          <ImagePlus size={15} />
          <span className="hidden sm:inline">{t(lang, "canvasAddImage")}</span>
        </button>
        <button type="button" className={`${toolbarButton} ${tool === "text" ? "bg-accent text-white hover:bg-accent-hover hover:text-white" : ""}`} onClick={() => setTool("text")} title={t(lang, "canvasAddText")}>
          <Type size={15} />
          <span className="hidden sm:inline">{t(lang, "canvasAddText")}</span>
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={toolbarButton} onClick={undo} disabled={!hasUndo} title={t(lang, "undo")}><Undo2 size={15} /></button>
        <button type="button" className={toolbarButton} onClick={redo} disabled={!hasRedo} title={t(lang, "redo")}><Redo2 size={15} /></button>
        <button type="button" className={toolbarButton} onClick={() => selectedId && moveLayer(selectedId, "up")} disabled={!canMoveLayerUp} title={t(lang, "canvasMoveLayerUp")} aria-label={t(lang, "canvasMoveLayerUp")}><ArrowUp size={15} /></button>
        <button type="button" className={toolbarButton} onClick={() => selectedId && moveLayer(selectedId, "down")} disabled={!canMoveLayerDown} title={t(lang, "canvasMoveLayerDown")} aria-label={t(lang, "canvasMoveLayerDown")}><ArrowDown size={15} /></button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={toolbarButton} onClick={() => zoomBy(0.8)} title={t(lang, "canvasZoomOut")}><ZoomOut size={15} /></button>
        <button type="button" className="h-8 min-w-12 rounded-md px-2 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary" onClick={() => updateViewportAt((svgRef.current?.getBoundingClientRect().left ?? 0) + (svgRef.current?.getBoundingClientRect().width ?? 0) / 2, (svgRef.current?.getBoundingClientRect().top ?? 0) + (svgRef.current?.getBoundingClientRect().height ?? 0) / 2, 1)} title={t(lang, "canvasResetZoom")}>{zoomLabel}</button>
        <button type="button" className={toolbarButton} onClick={() => zoomBy(1.25)} title={t(lang, "canvasZoomIn")}><ZoomIn size={15} /></button>
        <button type="button" className={toolbarButton} onClick={fitCanvas} title={t(lang, "canvasFit")}><Maximize2 size={15} /></button>
        <div className="flex-1" />
        <button type="button" className={toolbarButton} onClick={() => void handleExport()} disabled={board.items.length === 0 || exporting} title={t(lang, "canvasExport")} aria-busy={exporting}>
          <Download size={15} />
          <span className="hidden sm:inline">{exporting ? t(lang, "canvasExporting") : t(lang, "canvasExport")}</span>
        </button>
        <span className="mr-2 hidden text-xs text-text-muted sm:inline">{saveState === "saving" ? t(lang, "canvasSaving") : <><Check size={12} className="mr-1 inline text-success" />{t(lang, "canvasSaved")}</>}</span>
        <button type="button" className={toolbarButton} onClick={() => selectedId && removeItem(selectedId)} disabled={!selectedId} title={t(lang, "canvasDelete")}><Trash2 size={15} /></button>
      </div>
      <div className="app-work-area-overlay relative min-h-0 flex-1 overflow-hidden">
        <svg
          ref={svgRef}
          className={`h-full w-full touch-none select-none ${tool === "pan" || spaceHeldRef.current ? "cursor-grab" : "cursor-default"}`}
          role="application"
          aria-label={t(lang, "canvas")}
          onPointerDown={handleRootPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <defs>
            <pattern id="canvas-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--color-border)" strokeWidth="0.7" opacity="0.48" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="var(--canvas-background, var(--color-bg-primary))" />
          <g transform={`translate(${board.viewport.x} ${board.viewport.y}) scale(${board.viewport.zoom})`}>
            <rect x={-10000} y={-10000} width={20000} height={20000} fill="url(#canvas-grid)" />
            {orderedItems.map(renderItem)}
          </g>
        </svg>
        {editingTextItem && (
          <textarea
            ref={textEditorRef}
            value={editingText}
            spellCheck
            aria-label={t(lang, "canvasAddText")}
            onChange={(event) => setEditingText(event.target.value)}
            onBlur={() => finishEditingText()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                finishEditingText(true);
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                finishEditingText();
              }
            }}
            className="absolute z-40 resize-none"
            style={{
              boxSizing: "border-box",
              left: board.viewport.x + editingTextItem.x * board.viewport.zoom,
              top: board.viewport.y + editingTextItem.y * board.viewport.zoom,
              width: editingTextItem.width * board.viewport.zoom,
              height: editingTextItem.height * board.viewport.zoom,
              transform: `rotate(${editingTextItem.rotation}deg)`,
              transformOrigin: "center",
              border: "2px solid var(--color-accent)",
              borderRadius: Math.max(3, 6 * board.viewport.zoom),
              outline: "none",
              padding: Math.max(2, 8 * board.viewport.zoom),
              background: "var(--color-bg-primary)",
              color: editingTextItem.color,
              fontFamily: editingTextItem.fontFamily,
              fontSize: editingTextItem.fontSize * board.viewport.zoom,
              lineHeight: 1.35,
              pointerEvents: "auto",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
        )}
        {!loaded && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-primary/80 text-sm text-text-muted">{t(lang, "canvasLoading")}</div>}
        {loaded && board.items.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl border border-border bg-bg-secondary/90 px-5 py-4 text-center shadow-sm"><ImagePlus size={24} className="mx-auto mb-2 text-accent" /><p className="text-sm font-medium text-text-primary">{t(lang, "canvasEmpty")}</p><p className="mt-1 text-xs text-text-muted">{t(lang, "canvasPasteHint")}</p></div></div>}
        <div className="pointer-events-auto absolute bottom-4 right-4 z-20 w-[220px] overflow-hidden rounded-xl border border-border bg-bg-secondary/90 shadow-xl ring-1 ring-black/5 backdrop-blur-sm">
          <div className="flex h-8 items-center justify-between border-b border-border px-3 text-[11px] font-semibold text-text-secondary">
            <span>{t(lang, "canvasOverview")}</span>
            <span className="rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted">{minimap.items.length}</span>
          </div>
          <svg
            width="220"
            height="132"
            viewBox={`${minimap.viewBox.x} ${minimap.viewBox.y} ${minimap.viewBox.width} ${minimap.viewBox.height}`}
            className="block h-[132px] w-full cursor-default bg-bg-primary"
            aria-hidden="true"
          >
            <defs>
              <pattern id="canvas-minimap-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="var(--color-border)" strokeWidth="1" opacity="0.42" />
              </pattern>
              {minimap.items.filter((item): item is CanvasImageItem => item.type === "image").map((item) => (
                <clipPath key={`clip-${item.id}`} id={`canvas-minimap-clip-${item.id}`}>
                  <rect x={item.x} y={item.y} width={Math.max(8, item.width)} height={Math.max(5, item.height)} rx={Math.max(2, Math.min(8, item.width * 0.04))} />
                </clipPath>
              ))}
            </defs>
            <rect x={minimap.viewBox.x} y={minimap.viewBox.y} width={minimap.viewBox.width} height={minimap.viewBox.height} fill="var(--color-bg-primary)" />
            <rect x={minimap.viewBox.x} y={minimap.viewBox.y} width={minimap.viewBox.width} height={minimap.viewBox.height} fill="url(#canvas-minimap-grid)" />
            {minimap.items.map((item) => {
              const width = Math.max(8, item.width);
              const height = Math.max(5, item.height);
              const strokeWidth = Math.max(0.5, minimap.viewBox.width / 420);
              if (item.type === "image") {
                return (
                  <g key={item.id} className="cursor-pointer" onClick={(event) => handleMinimapItemClick(event, item)}>
                    <rect x={item.x + strokeWidth} y={item.y + strokeWidth} width={Math.max(1, width - strokeWidth * 2)} height={Math.max(1, height - strokeWidth * 2)} rx={Math.max(2, Math.min(8, width * 0.04))} fill="var(--color-accent-light)" opacity="0.95" />
                    {assets[item.asset] && <image href={assets[item.asset]} x={item.x} y={item.y} width={width} height={height} preserveAspectRatio="xMidYMid slice" clipPath={`url(#canvas-minimap-clip-${item.id})`} />}
                    <rect x={item.x} y={item.y} width={width} height={height} rx={Math.max(2, Math.min(8, width * 0.04))} fill="none" stroke={selectedId === item.id ? "var(--color-text-primary)" : "var(--color-accent)"} strokeWidth={selectedId === item.id ? strokeWidth * 1.8 : strokeWidth} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              }
              return (
                <g key={item.id} className="cursor-pointer" onClick={(event) => handleMinimapItemClick(event, item)}>
                  <rect x={item.x} y={item.y} width={width} height={height} rx={3} fill="var(--color-accent)" fillOpacity="0.16" stroke={selectedId === item.id ? "var(--color-text-primary)" : "var(--color-accent)"} strokeWidth={selectedId === item.id ? strokeWidth * 1.8 : strokeWidth} vectorEffect="non-scaling-stroke" />
                  <rect x={item.x + width * 0.12} y={item.y + height * 0.25} width={Math.max(4, width * 0.7)} height={Math.max(1, height * 0.08)} rx={1} fill="var(--color-accent)" opacity="0.7" />
                  <rect x={item.x + width * 0.12} y={item.y + height * 0.46} width={Math.max(3, width * 0.52)} height={Math.max(1, height * 0.08)} rx={1} fill="var(--color-accent)" opacity="0.45" />
                </g>
              );
            })}
            <rect
              x={minimap.viewport.x}
              y={minimap.viewport.y}
              width={Math.max(1, minimap.viewport.width)}
              height={Math.max(1, minimap.viewport.height)}
              fill="var(--color-accent)"
              fillOpacity="0.1"
              stroke="var(--color-accent)"
              strokeWidth={Math.max(1, minimap.viewBox.width / 260)}
              strokeDasharray={`${Math.max(3, minimap.viewBox.width / 90)} ${Math.max(2, minimap.viewBox.width / 150)}`}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </svg>
        </div>
        <div className="canvas-switcher absolute right-0 top-1/2 z-30 -mt-[30px] -translate-y-1/2">
          <div
            className={`canvas-switcher-panel flex flex-col ${canvasMenuOpen ? "canvas-switcher-panel--open" : ""}`}
            role="region"
            aria-label={t(lang, "canvas")}
            aria-expanded={canvasMenuOpen}
          >
            {creatingCanvas ? (
              <form
                className="canvas-switcher-create flex h-10 w-full flex-shrink-0 items-center gap-1 border-b border-border px-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createCanvas();
                }}
              >
                <Plus size={16} className="flex-shrink-0 text-accent" />
                <input
                  ref={newCanvasInputRef}
                  value={newCanvasName}
                  onChange={(event) => setNewCanvasName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCreatingCanvas(false);
                      setNewCanvasName("");
                    }
                  }}
                  className="canvas-switcher-input min-w-0 flex-1 bg-transparent px-2 text-xs text-text-primary outline-none placeholder:text-text-muted"
                  placeholder={t(lang, "canvasNamePlaceholder")}
                  maxLength={80}
                  aria-label={t(lang, "canvasNamePlaceholder")}
                  disabled={switchingCanvas || !canvasListLoaded || !loaded}
                />
                <button
                  type="submit"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-accent transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={switchingCanvas || !canvasListLoaded || !loaded || !newCanvasName.trim()}
                  title={t(lang, "add")}
                  aria-label={t(lang, "add")}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  onClick={() => {
                    setCreatingCanvas(false);
                    setNewCanvasName("");
                  }}
                  title={t(lang, "close")}
                  aria-label={t(lang, "close")}
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="canvas-switcher-new flex h-10 w-full flex-shrink-0 items-center gap-2 border-b border-border px-3 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setCanvasMenuOpen(true);
                  setCreatingCanvas(true);
                  setNewCanvasName("");
                }}
                disabled={switchingCanvas || !canvasListLoaded || !loaded}
                title={t(lang, "canvasNew")}
              >
                <span className="canvas-switcher-plus flex h-6 w-6 flex-shrink-0 items-center justify-center">
                  <Plus size={15} />
                </span>
                <span className={`overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity] duration-200 ${canvasMenuOpen ? "max-w-40 opacity-100" : "max-w-0 opacity-0"}`}>
                  {t(lang, "canvasNew")}
                </span>
              </button>
            )}
            <div className="min-h-0 max-h-[116px] overflow-x-hidden overflow-y-auto py-1">
              {canvases.map((canvas, index) => (
                <div
                  key={canvas.id}
                  className={`canvas-switcher-row mx-1 flex items-center rounded-md ${canvas.id === activeCanvasId ? "canvas-switcher-row--active bg-accent/15 text-accent" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
                  style={{ animationDelay: `${Math.min(index * 35, 210)}ms` }}
                >
                  <button
                    type="button"
                    className="flex h-9 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-bg-active/70 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void switchCanvas(canvas.id)}
                    disabled={switchingCanvas || !canvasListLoaded || !loaded}
                    title={canvas.name}
                    aria-label={`${t(lang, "canvas")}: ${canvas.name}`}
                  >
                    <span className="canvas-switcher-index flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-bg-hover text-[10px] font-semibold text-text-muted">{index + 1}</span>
                  </button>
                  {deletingCanvasId === canvas.id ? (
                    <div className="canvas-switcher-confirm flex h-9 min-w-0 flex-1 items-center gap-1 pr-1">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-danger">{tWithParams(lang, "canvasDeleteQuestion", { name: canvas.name })}</span>
                      <button
                        type="button"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-danger text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void removeCanvas(canvas.id)}
                        disabled={switchingCanvas || !canvasListLoaded || !loaded}
                        title={t(lang, "confirmYes")}
                        aria-label={t(lang, "confirmYes")}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
                        onClick={() => setDeletingCanvasId(null)}
                        title={t(lang, "confirmNo")}
                        aria-label={t(lang, "confirmNo")}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : renamingCanvasId === canvas.id ? (
                    <form
                      className="canvas-switcher-rename flex h-9 min-w-0 flex-1 items-center gap-1 pr-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameCanvas();
                      }}
                    >
                      <input
                        ref={renameCanvasInputRef}
                        value={renamingCanvasName}
                        onChange={(event) => setRenamingCanvasName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameCanvas();
                          }
                        }}
                        className="canvas-switcher-input h-7 min-w-0 flex-1 px-2 text-xs text-text-primary outline-none placeholder:text-text-muted"
                        placeholder={t(lang, "canvasNamePlaceholder")}
                        maxLength={80}
                        aria-label={t(lang, "canvasRename")}
                        disabled={switchingCanvas || !canvasListLoaded || !loaded}
                      />
                      <button
                        type="submit"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-accent transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={switchingCanvas || !canvasListLoaded || !loaded || !renamingCanvasName.trim()}
                        title={t(lang, "confirmYes")}
                        aria-label={t(lang, "confirmYes")}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-active hover:text-text-primary"
                        onClick={cancelRenameCanvas}
                        title={t(lang, "confirmNo")}
                        aria-label={t(lang, "confirmNo")}
                      >
                        <X size={13} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`h-9 min-w-0 flex-1 truncate whitespace-nowrap px-1 text-left text-xs transition-[max-width,opacity,color] duration-200 hover:underline disabled:cursor-not-allowed ${canvasMenuOpen ? "max-w-40 opacity-100" : "pointer-events-none max-w-0 opacity-0"}`}
                        onClick={() => beginRenameCanvas(canvas)}
                        disabled={switchingCanvas || !canvasListLoaded || !loaded}
                        title={`${t(lang, "canvasRename")}: ${canvas.name}`}
                      >
                        {canvas.name}
                      </button>
                      <button
                        type="button"
                        className={`canvas-switcher-delete flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed ${canvasMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
                        onClick={() => requestDeleteCanvas(canvas.id)}
                        disabled={switchingCanvas || !canvasListLoaded || !loaded}
                        title={t(lang, "canvasDeleteCanvas")}
                        aria-label={`${t(lang, "canvasDeleteCanvas")}: ${canvas.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="canvas-switcher-footer flex h-8 w-full flex-shrink-0 cursor-pointer items-center justify-center border-t border-border transition-colors hover:bg-bg-hover hover:text-accent"
              onClick={toggleCanvasMenu}
              title={t(lang, canvasMenuOpen ? "canvasCloseList" : "canvasOpenList")}
              aria-label={t(lang, canvasMenuOpen ? "canvasCloseList" : "canvasOpenList")}
              aria-expanded={canvasMenuOpen}
            >
              <PanelRight size={14} className={`transition-transform duration-300 ${canvasMenuOpen ? "rotate-180 text-accent" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
