import { readTextFile, writeTextFile, writeFile, readFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

const TODOS_FILE = "todos.json";
const NOTES_DIR = "notes";
const FONTS_FILE = "fonts.json";
const SETTINGS_FILE = "settings.json";

async function ensureDataDir() {
  const base = await appDataDir();
  const dir = await join(base, "data");
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function ensureNotesDir() {
  const base = await appDataDir();
  const dir = await join(base, "data", NOTES_DIR);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
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
export async function loadNoteList(): Promise<
  { id: string; title: string; tags: string[]; createdAt: string; updatedAt: string }[]
> {
  try {
    const base = await ensureNotesDir();
    const indexPath = await join(base, "index.json");
    if (await exists(indexPath)) {
      const content = await readTextFile(indexPath);
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("Failed to load note list:", e);
  }
  return [];
}

export async function saveNoteIndex(
  notes: { id: string; title: string; tags: string[]; createdAt: string; updatedAt: string }[]
): Promise<void> {
  try {
    const base = await ensureNotesDir();
    const indexPath = await join(base, "index.json");
    await writeTextFile(indexPath, JSON.stringify(notes, null, 2));
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

export async function deleteNoteFile(id: string): Promise<void> {
  try {
    const base = await ensureNotesDir();
    const path = await join(base, `${id}.md`);
    if (await exists(path)) {
      await remove(path);
    }
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
