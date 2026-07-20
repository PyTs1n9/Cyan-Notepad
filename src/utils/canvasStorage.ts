import { exists, mkdir, readDir, readFile, readTextFile, remove, rename, stat, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import type { CanvasBoard, CanvasDocument } from "@/types";
import { createEmptyCanvasBoard } from "@/types/canvas";
import { getDataDirectory, getImageTrashDirectory } from "@/utils/storage";

const CANVAS_DIR = "canvas";
const CANVAS_ASSETS_DIR = "img-canvas";
const LEGACY_CANVAS_ASSETS_DIR = "assets";
const CANVAS_BOARDS_DIR = "boards";
const CANVAS_BOARD_FILE = "board.json";
const CANVAS_INDEX_FILE = "index.json";
const CANVAS_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CANVAS_ASSET_FILENAME_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
export const DEFAULT_CANVAS_ID = "default";

let legacyCanvasAssetMigrationPromise: Promise<void> | null = null;
const canvasAssetOperationQueues = new Map<string, Promise<unknown>>();

export interface TrashedCanvasAsset {
  filename: string;
  path: string;
  modifiedAt: number;
}

function normalizeExtension(extension: string): string {
  const normalized = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized === "jpeg" ? "jpg" : normalized || "png";
}

function mimeTypeForExtension(extension: string): string {
  switch (normalizeExtension(extension)) {
    case "jpg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "bmp": return "image/bmp";
    default: return "image/png";
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

function isSafeCanvasAssetFilename(filename: string): boolean {
  return CANVAS_ASSET_FILENAME_PATTERN.test(filename);
}

async function migrateLegacyCanvasAssets(legacyAssetsDir: string, assetsDir: string): Promise<void> {
  try {
    if (!(await exists(legacyAssetsDir))) return;
    const entries = await readDir(legacyAssetsDir);
    for (const entry of entries) {
      if (!entry.isFile || !entry.name || !isSafeCanvasAssetFilename(entry.name)) continue;
      const source = await join(legacyAssetsDir, entry.name);
      const target = await join(assetsDir, entry.name);
      try {
        if (await exists(target)) {
          await remove(source);
        } else {
          await rename(source, target);
        }
      } catch (error) {
        console.warn("Failed to migrate legacy canvas asset:", entry.name, error);
      }
    }
  } catch (error) {
    console.warn("Failed to inspect legacy canvas assets:", error);
  }
}

async function getCanvasDirectories() {
  const root = await getDataDirectory();
  const canvasDir = await join(root, CANVAS_DIR);
  const assetsDir = await join(root, CANVAS_ASSETS_DIR);
  const legacyAssetsDir = await join(canvasDir, LEGACY_CANVAS_ASSETS_DIR);
  const boardsDir = await join(canvasDir, CANVAS_BOARDS_DIR);
  await mkdir(assetsDir, { recursive: true });
  await mkdir(boardsDir, { recursive: true });
  if (!legacyCanvasAssetMigrationPromise) {
    legacyCanvasAssetMigrationPromise = migrateLegacyCanvasAssets(legacyAssetsDir, assetsDir);
  }
  await legacyCanvasAssetMigrationPromise;
  return { canvasDir, assetsDir, boardsDir };
}

function safeCanvasId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "") || DEFAULT_CANVAS_ID;
}

async function getCanvasBoardPath(id: string): Promise<string> {
  const { boardsDir } = await getCanvasDirectories();
  return join(boardsDir, `${safeCanvasId(id)}.json`);
}

function getBoardImageAssets(board: CanvasBoard | null | undefined): Set<string> {
  return new Set(
    (board?.items ?? [])
      .filter((item): item is Extract<CanvasBoard["items"][number], { type: "image" }> => item.type === "image")
      .map((item) => item.asset)
      .filter(isSafeCanvasAssetFilename),
  );
}

function queueCanvasAssetOperation<T>(filename: string, operation: () => Promise<T>): Promise<T> {
  const previous = canvasAssetOperationQueues.get(filename) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  canvasAssetOperationQueues.set(filename, next);
  void next.then(
    () => { if (canvasAssetOperationQueues.get(filename) === next) canvasAssetOperationQueues.delete(filename); },
    () => { if (canvasAssetOperationQueues.get(filename) === next) canvasAssetOperationQueues.delete(filename); },
  );
  return next;
}

async function isCanvasAssetReferencedByOtherBoard(filename: string, excludedCanvasId?: string): Promise<boolean> {
  const { boardsDir } = await getCanvasDirectories();
  if (!(await exists(boardsDir))) return false;
  const excludedFilename = excludedCanvasId ? `${safeCanvasId(excludedCanvasId)}.json`.toLowerCase() : null;
  const entries = await readDir(boardsDir);
  for (const entry of entries) {
    if (!entry.isFile || !entry.name?.toLowerCase().endsWith(".json")) continue;
    if (excludedFilename && entry.name.toLowerCase() === excludedFilename) continue;
    try {
      const parsed = JSON.parse(await readTextFile(await join(boardsDir, entry.name))) as CanvasBoard;
      if (getBoardImageAssets(parsed).has(filename)) return true;
    } catch {
      // A malformed board may still reference the file; keep it recoverable.
      return true;
    }
  }
  return false;
}

export async function getCanvasAssetDirectory(): Promise<string> {
  return (await getCanvasDirectories()).assetsDir;
}

export async function getCanvasAssetTrashDirectory(): Promise<string> {
  return getImageTrashDirectory("canvas");
}

/** Move a canvas asset into img-trash/canvas while keeping its filename. */
export function archiveCanvasAsset(filename: string, excludedCanvasId?: string): Promise<boolean> {
  if (!isSafeCanvasAssetFilename(filename)) return Promise.resolve(false);
  return queueCanvasAssetOperation(filename, async () => {
    if (excludedCanvasId && await isCanvasAssetReferencedByOtherBoard(filename, excludedCanvasId)) return false;
    const { assetsDir } = await getCanvasDirectories();
    const trashDir = await getCanvasAssetTrashDirectory();
    const source = await join(assetsDir, filename);
    const target = await join(trashDir, filename);
    if (!(await exists(source))) return await exists(target);
    if (await exists(target)) await remove(target);
    await rename(source, target);
    return true;
  });
}

/** Restore a previously archived canvas asset to data/img-canvas. */
export function restoreCanvasAsset(filename: string): Promise<boolean> {
  if (!isSafeCanvasAssetFilename(filename)) return Promise.resolve(false);
  return queueCanvasAssetOperation(filename, async () => {
    const { assetsDir } = await getCanvasDirectories();
    const trashDir = await getCanvasAssetTrashDirectory();
    const source = await join(trashDir, filename);
    const target = await join(assetsDir, filename);
    if (await exists(target)) {
      if (await exists(source)) await remove(source);
      return true;
    }
    if (!(await exists(source))) return false;
    await rename(source, target);
    return true;
  });
}

/** Permanently remove a canvas asset from the canvas trash partition. */
export function deleteCanvasAssetPermanently(filename: string): Promise<boolean> {
  if (!isSafeCanvasAssetFilename(filename)) return Promise.resolve(false);
  return queueCanvasAssetOperation(filename, async () => {
    const path = await join(await getCanvasAssetTrashDirectory(), filename);
    if (!(await exists(path))) return false;
    await remove(path);
    return true;
  });
}

export async function listTrashedCanvasAssets(): Promise<TrashedCanvasAsset[]> {
  const trashDir = await getCanvasAssetTrashDirectory();
  const entries = await readDir(trashDir);
  const assets = await Promise.all(entries
    .filter((entry) => entry.isFile && Boolean(entry.name) && isSafeCanvasAssetFilename(entry.name))
    .map(async (entry) => {
      const filename = entry.name!;
      const path = await join(trashDir, filename);
      const info = await stat(path);
      return {
        filename,
        path,
        modifiedAt: info.mtime ? new Date(info.mtime).getTime() : 0,
      };
    }));
  return assets.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Purge old canvas trash files; callers can choose a shorter/longer retention window. */
export async function purgeTrashedCanvasAssets(maxAgeMs = CANVAS_TRASH_RETENTION_MS): Promise<void> {
  const expiration = Date.now() - Math.max(0, maxAgeMs);
  for (const asset of await listTrashedCanvasAssets()) {
    if (asset.modifiedAt > expiration) continue;
    try {
      await deleteCanvasAssetPermanently(asset.filename);
    } catch (error) {
      console.warn("Failed to purge canvas asset trash:", asset.filename, error);
    }
  }
}

/** Reconcile active references so delete/undo/redo all move the backing file consistently. */
export async function syncCanvasAssetStorage(
  previousBoard: CanvasBoard | null | undefined,
  nextBoard: CanvasBoard,
  canvasId?: string,
): Promise<void> {
  const previousAssets = getBoardImageAssets(previousBoard);
  const nextAssets = getBoardImageAssets(nextBoard);
  await Promise.all([
    ...[...previousAssets].filter((asset) => !nextAssets.has(asset)).map((asset) => archiveCanvasAsset(asset, canvasId)),
    ...[...nextAssets].filter((asset) => !previousAssets.has(asset)).map((asset) => restoreCanvasAsset(asset)),
  ]);
}

export async function archiveCanvasBoardAssets(board: CanvasBoard, canvasId?: string): Promise<void> {
  await Promise.all([...getBoardImageAssets(board)].map((asset) => archiveCanvasAsset(asset, canvasId)));
}

export async function loadCanvasList(): Promise<CanvasDocument[]> {
  try {
    const { canvasDir } = await getCanvasDirectories();
    const indexPath = await join(canvasDir, CANVAS_INDEX_FILE);
    if (await exists(indexPath)) {
      const parsed = JSON.parse(await readTextFile(indexPath)) as unknown;
      if (Array.isArray(parsed)) {
        const entries = parsed.filter((entry): entry is CanvasDocument => (
          Boolean(entry)
          && typeof entry === "object"
          && typeof (entry as CanvasDocument).id === "string"
          && typeof (entry as CanvasDocument).name === "string"
        ));
        if (entries.length > 0 || parsed.length === 0) return entries;
      }
    }

    // Migrate the original single-board format the first time a canvas list is needed.
    const legacyPath = await join(canvasDir, CANVAS_BOARD_FILE);
    const now = new Date().toISOString();
    const defaultCanvas: CanvasDocument = {
      id: DEFAULT_CANVAS_ID,
      name: "默认画布",
      createdAt: now,
      updatedAt: now,
    };
    const legacyBoard = (await exists(legacyPath))
      ? JSON.parse(await readTextFile(legacyPath)) as CanvasBoard
      : createEmptyCanvasBoard();
    await saveCanvasBoard(legacyBoard, DEFAULT_CANVAS_ID);
    await saveCanvasList([defaultCanvas]);
    return [defaultCanvas];
  } catch (error) {
    console.error("Failed to load canvas list:", error);
    return [{
      id: DEFAULT_CANVAS_ID,
      name: "默认画布",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
  }
}

export async function saveCanvasList(canvases: CanvasDocument[]): Promise<void> {
  try {
    const { canvasDir } = await getCanvasDirectories();
    const path = await join(canvasDir, CANVAS_INDEX_FILE);
    await writeTextFile(path, JSON.stringify(canvases, null, 2));
  } catch (error) {
    console.error("Failed to save canvas list:", error);
  }
}

export async function loadCanvasBoard(id = DEFAULT_CANVAS_ID): Promise<CanvasBoard | null> {
  try {
    const boardPath = await getCanvasBoardPath(id);
    if (await exists(boardPath)) {
      return JSON.parse(await readTextFile(boardPath)) as CanvasBoard;
    }

    // Keep loading the legacy path for an existing installation while migration is in progress.
    if (safeCanvasId(id) === DEFAULT_CANVAS_ID) {
      const { canvasDir } = await getCanvasDirectories();
      const legacyPath = await join(canvasDir, CANVAS_BOARD_FILE);
      if (await exists(legacyPath)) return JSON.parse(await readTextFile(legacyPath)) as CanvasBoard;
    }
    return null;
  } catch (error) {
    console.error("Failed to load canvas board:", error);
    return null;
  }
}

export async function saveCanvasBoard(board: CanvasBoard, id = DEFAULT_CANVAS_ID): Promise<void> {
  try {
    const path = await getCanvasBoardPath(id);
    const previousBoard = await loadCanvasBoard(id);
    await writeTextFile(path, JSON.stringify(board, null, 2));
    await syncCanvasAssetStorage(previousBoard, board, id);
  } catch (error) {
    console.error("Failed to save canvas board:", error);
  }
}

export async function deleteCanvasBoard(id: string): Promise<void> {
  try {
    const board = await loadCanvasBoard(id);
    const path = await getCanvasBoardPath(id);
    if (await exists(path)) await remove(path);
    if (safeCanvasId(id) === DEFAULT_CANVAS_ID) {
      const { canvasDir } = await getCanvasDirectories();
      const legacyPath = await join(canvasDir, CANVAS_BOARD_FILE);
      if (await exists(legacyPath)) await remove(legacyPath);
    }
    if (board) await archiveCanvasBoardAssets(board, id);
  } catch (error) {
    console.error("Failed to delete canvas board:", error);
  }
}

export async function saveCanvasAsset(data: Uint8Array, extension: string): Promise<string> {
  const { assetsDir } = await getCanvasDirectories();
  const safeExtension = normalizeExtension(extension);
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = `${id}.${safeExtension}`;
  await writeFile(await join(assetsDir, filename), data);
  return filename;
}

export async function loadCanvasAsset(filename: string): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!isSafeCanvasAssetFilename(filename)) return null;
  try {
    const { assetsDir, canvasDir } = await getCanvasDirectories();
    let path = await join(assetsDir, filename);
    if (!(await exists(path))) {
      // A board may be loaded while its file is still in the reversible trash.
      await restoreCanvasAsset(filename);
    }
    if (!(await exists(path))) {
      // Keep a lazy fallback for a partially completed legacy migration.
      const legacyPath = await join(canvasDir, LEGACY_CANVAS_ASSETS_DIR, filename);
      if (await exists(legacyPath)) {
        await rename(legacyPath, path);
      }
    }
    if (!(await exists(path))) return null;
    const extension = filename.split(".").pop() ?? "png";
    const bytes = new Uint8Array(await readFile(path));
    const mimeType = mimeTypeForExtension(extension);
    return { dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`, mimeType };
  } catch (error) {
    console.error("Failed to load canvas asset:", error);
    return null;
  }
}
