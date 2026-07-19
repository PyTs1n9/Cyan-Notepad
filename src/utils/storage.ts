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
import { appDataDir, dirname, join, resourceDir } from "@tauri-apps/api/path";
import type { Note, NoteCategory } from "@/types";

const TODOS_FILE = "todos.json";
const NOTES_DIR = "notes";
const IMAGES_DIR = "img";
const IMAGE_TRASH_DIR = "img-trash";
const IMAGE_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FONTS_FILE = "fonts.json";
const SETTINGS_FILE = "settings.json";
const DATA_DIR_NAME = "data";

let dataDirectoryPromise: Promise<string> | null = null;

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

async function resolveDataDirectory(): Promise<string> {
  const fallback = await join(await appDataDir(), DATA_DIR_NAME);

  // Frontend-only development should continue using the normal app data path
  // instead of creating a data folder in the Vite/Tauri build directory.
  if (!import.meta.env.PROD) {
    await ensureDirectory(fallback);
    return fallback;
  }

  // Tile windows are intentionally read-only. They can use an already-created
  // install data directory, but must not run the write probe or migration.
  if (new URLSearchParams(window.location.search).get("tile") === "1") {
    try {
      const installData = await join(await resourceDir(), DATA_DIR_NAME);
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
    const installData = await join(await resourceDir(), DATA_DIR_NAME);
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

async function ensureImageDir() {
  const base = await getDataRoot();
  const dir = await join(base, IMAGES_DIR);
  await ensureDirectory(dir);
  return dir;
}

export async function getImageDirectory(): Promise<string> {
  return ensureImageDir();
}

export async function getImageTrashDirectory(): Promise<string> {
  const dir = await join(await getDataRoot(), IMAGE_TRASH_DIR);
  await ensureDirectory(dir);
  return dir;
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
    const trashPath = await join(dataRoot, IMAGE_TRASH_DIR, filename);
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
    const trashDir = await join(dataRoot, IMAGE_TRASH_DIR);
    await ensureDirectory(trashDir);

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
