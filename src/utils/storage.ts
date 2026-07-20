import {
  copyFile,
  readTextFile,
  writeTextFile,
  writeFile,
  readFile,
  exists,
  mkdir,
  remove,
  readDir,
  rename,
  stat,
} from "@tauri-apps/plugin-fs";
import { appDataDir, dirname, executableDir, join, resourceDir } from "@tauri-apps/api/path";
import type { Note, NoteCategory, TodoListData } from "@/types";

const TODOS_FILE = "todos.json";
const TODO_LISTS_FILE = "todo-lists.json";
const NOTES_DIR = "notes";
const IMAGES_DIR = "img";
const IMAGE_TRASH_DIR = "img-trash";
const IMAGE_TRASH_PARTITION_DIRS = {
  notes: "notes",
  canvas: "canvas",
} as const;
const IMAGE_NEED_DIR = "img-need";
const IMAGE_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AVATAR_CACHE_PREFIX = "avatar-";
const CUSTOM_BACKGROUND_PREFIX = "background-";
const FONTS_FILE = "fonts.json";
const SETTINGS_FILE = "settings.json";
const DATA_DIR_NAME = "data";

let dataDirectoryPromise: Promise<string> | null = null;
let imageNeedDirectoryPromise: Promise<string> | null = null;
let legacyImageTrashMigrationPromise: Promise<void> | null = null;

export type ImageTrashPartition = keyof typeof IMAGE_TRASH_PARTITION_DIRS;

async function ensureDirectory(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function hasEntries(path: string): Promise<boolean> {
  try {
    return (await readDir(path)).length > 0;
  } catch {
    return false;
  }
}

async function assertWritable(path: string): Promise<void> {
  await ensureDirectory(path);
  const probe = await join(path, `.write-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeTextFile(probe, "");
  await remove(probe);
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await ensureDirectory(target);
  const entries = await readDir(source);
  for (const entry of entries) {
    if (!entry.name) continue;
    const sourcePath = await join(source, entry.name);
    const targetPath = await join(target, entry.name);
    if (entry.isDirectory) {
      await copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function verifyDirectory(source: string, target: string): Promise<void> {
  const entries = await readDir(source);
  for (const entry of entries) {
    if (!entry.name) continue;
    const sourcePath = await join(source, entry.name);
    const targetPath = await join(target, entry.name);
    if (entry.isDirectory) {
      if (!(await exists(targetPath))) {
        throw new Error(`Missing migrated directory: ${targetPath}`);
      }
      await verifyDirectory(sourcePath, targetPath);
    } else if (entry.isFile) {
      if (!(await exists(targetPath))) {
        throw new Error(`Missing migrated file: ${targetPath}`);
      }
      const [sourceInfo, targetInfo] = await Promise.all([stat(sourcePath), stat(targetPath)]);
      if (sourceInfo.size !== targetInfo.size) {
        throw new Error(`Migrated file size mismatch: ${entry.name}`);
      }
    }
  }
}

async function migrateLegacyData(source: string, target: string): Promise<void> {
  if (source.toLowerCase() === target.toLowerCase()) return;
  if (!(await hasEntries(source)) || (await hasEntries(target))) return;

  const parent = await dirname(target);
  const staging = await join(parent, `.data-migration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    await copyDirectory(source, staging);
    await verifyDirectory(source, staging);
    // The target was empty when migration started. Replacing it only after
    // verification prevents a partial copy from becoming the active store.
    await remove(target, { recursive: true });
    await rename(staging, target);
    try {
      await remove(source, { recursive: true });
    } catch (error) {
      console.warn("Migrated data, but could not remove the legacy data directory:", error);
    }
  } catch (error) {
    try {
      if (await exists(staging)) await remove(staging, { recursive: true });
    } catch {
      // Keep the original migration error; the legacy directory remains intact.
    }
    throw error;
  }
}

async function resolveLocalProjectDataDirectory(): Promise<string | null> {
  try {
    const resources = (await resourceDir()).replace(/\\/g, "/").replace(/\/+$/, "");
    const match = resources.match(/^(.*)\/src-tauri\/target\/(?:debug|release)(?:\/.*)?$/i);
    return match ? await join(match[1], DATA_DIR_NAME) : null;
  } catch {
    return null;
  }
}

async function resolveDataDirectory(): Promise<string> {
  const fallback = await join(await appDataDir(), DATA_DIR_NAME);

  if (!import.meta.env.PROD) {
    // Tauri dev runs keep their data alongside the project instead of sharing
    // the installed app's AppData directory.
    const localProjectData = await resolveLocalProjectDataDirectory();
    if (localProjectData) {
      try {
        await assertWritable(localProjectData);
        return localProjectData;
      } catch (error) {
        console.warn("Project data directory is not writable; using AppData:", error);
      }
    }

    // Frontend-only development has no local Tauri resource path.
    await ensureDirectory(fallback);
    return fallback;
  }

  // Tile windows are intentionally read-only. They can use an already-created
  // install data directory, but must not run the write probe or migration.
  if (new URLSearchParams(window.location.search).get("tile") === "1") {
    try {
      const installData = await join(await executableDir(), DATA_DIR_NAME);
      if (await exists(installData)) return installData;
    } catch {
      // Fall through to the legacy AppData location.
    }
    try {
      await ensureDirectory(fallback);
    } catch {
      // The main window will create the directory when it starts.
    }
    return fallback;
  }

  try {
    const installData = await join(await executableDir(), DATA_DIR_NAME);
    await assertWritable(installData);
    try {
      await migrateLegacyData(fallback, installData);
    } catch (error) {
      console.warn("Could not migrate legacy data to the install directory; using AppData:", error);
      return fallback;
    }
    return installData;
  } catch (error) {
    console.warn("Install directory is not writable; using AppData:", error);
    await ensureDirectory(fallback);
    return fallback;
  }
}

async function getDataRoot(): Promise<string> {
  if (!dataDirectoryPromise) {
    dataDirectoryPromise = resolveDataDirectory();
  }
  return dataDirectoryPromise;
}

export async function getDataDirectory(): Promise<string> {
  return getDataRoot();
}

function getTitleFromContent(content: string, fallback: string): string {
  const plain = content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (plain || fallback).slice(0, 40);
}

async function ensureDataDir() {
  const dir = await getDataRoot();
  await ensureDirectory(dir);
  return dir;
}

async function ensureNotesDir() {
  const base = await getDataRoot();
  const dir = await join(base, NOTES_DIR);
  await ensureDirectory(dir);
  return dir;
}

export async function getNotesDirectory(): Promise<string> {
  return ensureNotesDir();
}

async function ensureImageDir() {
  const base = await getDataRoot();
  const dir = await join(base, IMAGES_DIR);
  await ensureDirectory(dir);
  return dir;
}

export async function getImageDirectory(): Promise<string> {
  return ensureImageDir();
}

async function migrateLegacyImageTrashFiles(trashRoot: string, notesTrashDir: string): Promise<void> {
  try {
    const entries = await readDir(trashRoot);
    for (const entry of entries) {
      if (!entry.isFile || !entry.name) continue;
      // These files belong to img-need and are migrated by ensureImageNeedDirectory().
      if (isAvatarCacheFilename(entry.name) || isCustomBackgroundFilename(entry.name)) continue;
      const source = await join(trashRoot, entry.name);
      const target = await join(notesTrashDir, entry.name);
      try {
        if (await exists(target)) {
          await remove(source);
        } else {
          await rename(source, target);
        }
      } catch (error) {
        console.warn("Failed to partition legacy image trash:", entry.name, error);
      }
    }
  } catch (error) {
    console.warn("Failed to inspect legacy image trash:", error);
  }
}

async function ensureImageTrashDirectories(): Promise<{
  root: string;
  notes: string;
  canvas: string;
}> {
  const trashRoot = await join(await getDataRoot(), IMAGE_TRASH_DIR);
  const notesTrashDir = await join(trashRoot, IMAGE_TRASH_PARTITION_DIRS.notes);
  const canvasTrashDir = await join(trashRoot, IMAGE_TRASH_PARTITION_DIRS.canvas);
  await Promise.all([
    ensureDirectory(notesTrashDir),
    ensureDirectory(canvasTrashDir),
  ]);

  if (!legacyImageTrashMigrationPromise) {
    legacyImageTrashMigrationPromise = migrateLegacyImageTrashFiles(trashRoot, notesTrashDir);
  }
  await legacyImageTrashMigrationPromise;
  return { root: trashRoot, notes: notesTrashDir, canvas: canvasTrashDir };
}

export async function getImageTrashRootDirectory(): Promise<string> {
  return (await ensureImageTrashDirectories()).root;
}

export async function getImageTrashDirectory(partition: ImageTrashPartition = "notes"): Promise<string> {
  return (await ensureImageTrashDirectories())[partition];
}

async function ensureImageNeedDirectory(): Promise<string> {
  const dataRoot = await getDataRoot();
  const dir = await join(dataRoot, IMAGE_NEED_DIR);
  await ensureDirectory(dir);

  // Move avatar/background files created by older builds out of img-trash.
  const trashDir = await join(dataRoot, IMAGE_TRASH_DIR);
  if (await exists(trashDir)) {
    const entries = await readDir(trashDir);
    for (const entry of entries) {
      if (!entry.isFile || !entry.name) continue;
      if (!isAvatarCacheFilename(entry.name) && !isCustomBackgroundFilename(entry.name)) continue;
      const source = await join(trashDir, entry.name);
      const target = await join(dir, entry.name);
      try {
        if (!(await exists(target))) await rename(source, target);
      } catch (error) {
        console.warn("Failed to migrate retained image into img-need:", entry.name, error);
      }
    }
  }
  return dir;
}

export async function getImageNeedDirectory(): Promise<string> {
  if (!imageNeedDirectoryPromise) {
    imageNeedDirectoryPromise = ensureImageNeedDirectory();
  }
  return imageNeedDirectoryPromise;
}

// --- Todos ---
export async function loadTodos<T>(): Promise<T[]> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, TODOS_FILE);
    if (await exists(path)) {
      const content = await readTextFile(path);
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Failed to load todos:", e);
  }
  return [];
}

export async function saveTodos<T>(todos: T[]): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, TODOS_FILE);
    await writeTextFile(path, JSON.stringify(todos, null, 2));
  } catch (e) {
    console.error("Failed to save todos:", e);
  }
}

// --- Notes ---
async function recoverNoteListFromFiles(base: string): Promise<Note[]> {
  try {
    const entries = await readDir(base);
    const files = entries
      .filter((entry) => entry.isFile && entry.name.endsWith(".md"))
      .sort((a, b) => a.name.localeCompare(b.name));
    const notes = await Promise.all(files.map(async (file, index) => {
      const id = file.name.replace(/\.md$/i, "");
      const path = await join(base, file.name);
      const content = await readTextFile(path);
      const now = new Date().toISOString();
      return {
        id,
        title: getTitleFromContent(content, id),
        content: "",
        tags: [],
        categoryId: null,
        pinned: false,
        order: index,
        createdAt: now,
        updatedAt: now,
      };
    }));
    return notes;
  } catch (e) {
    console.error("Failed to recover note list from files:", e);
  }
  return [];
}

export async function loadTodoLists(): Promise<TodoListData | null> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, TODO_LISTS_FILE);
    if (await exists(path)) {
      const content = await readTextFile(path);
      return JSON.parse(content) as TodoListData;
    }
  } catch (e) {
    console.error("Failed to load todo lists:", e);
  }
  return null;
}

export async function saveTodoLists(data: TodoListData): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, TODO_LISTS_FILE);
    await writeTextFile(path, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to save todo lists:", e);
  }
}

export async function loadNoteList(): Promise<{ notes: Note[]; categories: NoteCategory[] }> {
  const base = await ensureNotesDir();
  try {
    const indexPath = await join(base, "index.json");
    if (await exists(indexPath)) {
      const content = await readTextFile(indexPath);
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        const notes = parsed.length > 0 ? parsed : await recoverNoteListFromFiles(base);
        return { notes, categories: [] };
      }
      const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
      return { notes: notes.length > 0 ? notes : await recoverNoteListFromFiles(base), categories };
    }
  } catch (e) {
    console.error("Failed to load note list:", e);
  }
  return { notes: await recoverNoteListFromFiles(base), categories: [] };
}

export async function saveNoteIndex(
  notes: {
    id: string;
    title: string;
    tags: string[];
    categoryId?: string | null;
    pinned?: boolean;
    order: number;
    createdAt: string;
    updatedAt: string;
  }[],
  categories: NoteCategory[] = [],
): Promise<void> {
  try {
    const base = await ensureNotesDir();
    const indexPath = await join(base, "index.json");
    await writeTextFile(indexPath, JSON.stringify({ notes, categories }, null, 2));
  } catch (e) {
    console.error("Failed to save note index:", e);
  }
}

export async function loadNoteContent(id: string): Promise<string> {
  try {
    const base = await ensureNotesDir();
    const path = await join(base, `${id}.md`);
    if (await exists(path)) {
      return await readTextFile(path);
    }
  } catch (e) {
    console.error("Failed to load note content:", e);
  }
  return "";
}

export async function saveNoteContent(id: string, content: string): Promise<void> {
  try {
    const base = await ensureNotesDir();
    const path = await join(base, `${id}.md`);
    await writeTextFile(path, content);
  } catch (e) {
    console.error("Failed to save note content:", e);
  }
}

function normalizeImageExtension(extension: string): string {
  const normalized = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || "png";
}

function isAvatarCacheFilename(filename: string): boolean {
  return new RegExp(`^${AVATAR_CACHE_PREFIX}[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`, "i").test(filename);
}

function isCustomBackgroundFilename(filename: string): boolean {
  return new RegExp(`^${CUSTOM_BACKGROUND_PREFIX}[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`, "i").test(filename);
}

export interface StoredImageHistoryItem {
  filename: string;
  path: string;
  modifiedAt: number;
}

function safeAvatarUserId(userId: string): string {
  return userId.replace(/[^A-Za-z0-9_-]/g, "-");
}

function isAvatarFilenameForUser(filename: string, userId: string): boolean {
  const prefix = `${AVATAR_CACHE_PREFIX}${safeAvatarUserId(userId)}`;
  return filename.startsWith(`${prefix}.`) || filename.startsWith(`${prefix}-`);
}

async function listImageHistory(predicate: (filename: string) => boolean): Promise<StoredImageHistoryItem[]> {
  const dir = await getImageNeedDirectory();
  const entries = await readDir(dir);
  const items = await Promise.all(entries
    .filter((entry) => entry.isFile && entry.name && predicate(entry.name))
    .map(async (entry) => {
      const path = await join(dir, entry.name!);
      const info = await stat(path);
      return {
        filename: entry.name!,
        path,
        modifiedAt: info.mtime ? new Date(info.mtime).getTime() : 0,
      };
    }));
  return items.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Keep every uploaded avatar in img-need so it remains available in history. */
export async function saveAvatarCache(userId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("Unsupported avatar data");

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = `${AVATAR_CACHE_PREFIX}${safeAvatarUserId(userId)}-${id}.jpg`;
  const imageNeedDir = await getImageNeedDirectory();

  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  await writeFile(await join(imageNeedDir, filename), bytes);
  return filename;
}

export async function listAvatarHistory(userId: string): Promise<StoredImageHistoryItem[]> {
  return listImageHistory((filename) => isAvatarFilenameForUser(filename, userId));
}

export async function loadAvatarCacheDataUrl(filename: string, userId: string): Promise<string> {
  if (!isAvatarCacheFilename(filename) || !isAvatarFilenameForUser(filename, userId)) {
    throw new Error("Invalid avatar history filename");
  }
  const bytes = await readFile(await join(await getImageNeedDirectory(), filename));
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function deleteAvatarCache(filename: string, userId: string): Promise<void> {
  if (!isAvatarCacheFilename(filename) || !isAvatarFilenameForUser(filename, userId)) return;
  const path = await join(await getImageNeedDirectory(), filename);
  if (await exists(path)) await remove(path);
}

/** Keep every uploaded app background in img-need so it remains available in history. */
export async function saveCustomBackground(data: Uint8Array, extension: string): Promise<string> {
  const normalizedExtension = normalizeImageExtension(extension);
  if (!new Set(["jpg", "jpeg", "png", "webp"]).has(normalizedExtension)) {
    throw new Error("Unsupported background image type");
  }

  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = `${CUSTOM_BACKGROUND_PREFIX}${id}.${normalizedExtension}`;
  await writeFile(await join(await getImageNeedDirectory(), filename), data);
  return filename;
}

export async function listCustomBackgroundHistory(): Promise<StoredImageHistoryItem[]> {
  return listImageHistory(isCustomBackgroundFilename);
}

export async function resolveCustomBackground(filename: string): Promise<string | null> {
  if (!isCustomBackgroundFilename(filename)) return null;
  try {
    const path = await join(await getImageNeedDirectory(), filename);
    return await exists(path) ? path : null;
  } catch {
    return null;
  }
}

export async function deleteCustomBackground(filename: string): Promise<void> {
  if (!isCustomBackgroundFilename(filename)) return;
  const path = await join(await getImageNeedDirectory(), filename);
  if (await exists(path)) await remove(path);
}

export async function saveImageAttachment(
  data: Uint8Array,
  extension: string,
): Promise<string> {
  const imageDir = await ensureImageDir();
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filename = `${id}.${normalizeImageExtension(extension)}`;
  const path = await join(imageDir, filename);
  await writeFile(path, data);
  return filename;
}

export async function resolveImageAttachment(filename: string): Promise<string | null> {
  // Attachment references are intentionally limited to generated filenames;
  // never allow a Markdown link to escape the data/img directory.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filename)) return null;
  try {
    const dataRoot = await getDataRoot();
    const imageDir = await join(dataRoot, IMAGES_DIR);
    const path = await join(imageDir, filename);
    if (await exists(path)) return path;

    // An attachment may have been moved to the reversible trash after a
    // mistaken edit. Restore it lazily when the user undoes that edit.
    const trashPath = await join(await getImageTrashDirectory("notes"), filename);
    if (!(await exists(trashPath))) return null;
    await ensureDirectory(imageDir);
    await rename(trashPath, path);
    return path;
  } catch {
    return null;
  }
}

const ATTACHMENT_REFERENCE_PATTERN = /attachment:\/\/([A-Za-z0-9_-]+\.[A-Za-z0-9]+)/gi;

export async function cleanupUnusedImageAttachments(): Promise<void> {
  try {
    const dataRoot = await getDataRoot();
    const imageDir = await join(dataRoot, IMAGES_DIR);
    if (!(await exists(imageDir))) return;
    const trashDir = await getImageTrashDirectory("notes");

    const referenced = new Set<string>();
    const notesDir = await join(dataRoot, NOTES_DIR);
    if (await exists(notesDir)) {
      const noteEntries = await readDir(notesDir);
      for (const entry of noteEntries) {
        if (!entry.isFile || !entry.name?.toLowerCase().endsWith(".md")) continue;
        try {
          const content = await readTextFile(await join(notesDir, entry.name));
          for (const match of content.matchAll(ATTACHMENT_REFERENCE_PATTERN)) {
            referenced.add(match[1].toLowerCase());
          }
        } catch {
          // A single unreadable note must not block cleanup of other files.
        }
      }
    }

    // Restore references that were previously quarantined after an edit.
    for (const filename of referenced) {
      const activePath = await join(imageDir, filename);
      const trashPath = await join(trashDir, filename);
      if (!(await exists(activePath)) && (await exists(trashPath))) {
        await rename(trashPath, activePath);
      }
    }

    const imageEntries = await readDir(imageDir);
    for (const entry of imageEntries) {
      if (!entry.isFile || !entry.name) continue;
      if (referenced.has(entry.name.toLowerCase())) continue;
      try {
        const sourcePath = await join(imageDir, entry.name);
        const trashPath = await join(trashDir, entry.name);
        if (await exists(trashPath)) await remove(trashPath);
        await rename(sourcePath, trashPath);
      } catch (error) {
        console.warn("Failed to quarantine unused image attachment:", entry.name, error);
      }
    }

    const trashEntries = await readDir(trashDir);
    const expiration = Date.now() - IMAGE_TRASH_RETENTION_MS;
    for (const entry of trashEntries) {
      if (!entry.isFile || !entry.name) continue;
      if (referenced.has(entry.name.toLowerCase())) continue;
      try {
        const info = await stat(await join(trashDir, entry.name));
        if (info.mtime && new Date(info.mtime).getTime() > expiration) continue;
        await remove(await join(trashDir, entry.name));
      } catch (error) {
        console.warn("Failed to purge expired image attachment:", entry.name, error);
      }
    }
  } catch (error) {
    console.warn("Failed to clean unused image attachments:", error);
  }
}

export async function deleteNoteFile(id: string): Promise<void> {
  try {
    const base = await ensureNotesDir();
    const path = await join(base, `${id}.md`);
    if (await exists(path)) {
      await remove(path);
    }
    await cleanupUnusedImageAttachments();
  } catch (e) {
    console.error("Failed to delete note file:", e);
  }
}

// --- App Icon ---
const ICON_FILE = "app-icon.png";

export async function saveIconData(data: Uint8Array): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, ICON_FILE);
    await writeFile(path, data);
  } catch (e) {
    console.error("Failed to save icon:", e);
  }
}

export async function loadIconData(): Promise<Uint8Array | null> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, ICON_FILE);
    if (await exists(path)) {
      return new Uint8Array(await readFile(path));
    }
  } catch (e) {
    console.error("Failed to load icon:", e);
  }
  return null;
}

// --- Fonts ---
export async function loadSavedFonts(): Promise<
  { name: string; family: string; path: string }[]
> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, FONTS_FILE);
    if (await exists(path)) {
      const content = await readTextFile(path);
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Failed to load fonts:", e);
  }
  return [];
}

export async function saveFontList(
  fonts: { name: string; family: string; path: string }[]
): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, FONTS_FILE);
    await writeTextFile(path, JSON.stringify(fonts, null, 2));
  } catch (e) {
    console.error("Failed to save fonts:", e);
  }
}

// --- Settings ---
export async function loadSettings(): Promise<Record<string, unknown>> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, SETTINGS_FILE);
    if (await exists(path)) {
      const content = await readTextFile(path);
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return {};
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, SETTINGS_FILE);
    await writeTextFile(path, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}
