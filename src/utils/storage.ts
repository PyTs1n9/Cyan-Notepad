import {
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
import { join, resourceDir } from "@tauri-apps/api/path";
import type { Note, NoteCategory, TodoListData } from "@/types";
import { markKnowledgeDirty, markNoteContentDirty } from "@/utils/ai/knowledgeDirty";
import {
  TRASH_RETENTION_DISABLED,
  TRASH_RETENTION_FOREVER,
  normalizeTrashRetentionDays,
  useSettingsStore,
} from "@/stores/settingsStore";

const TODOS_FILE = "todos.json";
const TODO_LISTS_FILE = "todo-lists.json";
const NOTES_DIR = "notes";
const NOTE_INDEX_FILE = "index.json";
const NOTE_INDEX_BACKUP_FILE = "index.backup.json";
const IMAGES_DIR = "img";
const IMAGE_TRASH_DIR = "img-trash";
const IMAGE_TRASH_PARTITION_DIRS = {
  notes: "notes",
  canvas: "canvas",
} as const;
const IMAGE_NEED_DIR = "img-need";
const NOTE_TRASH_DIR = "trash";
const NOTE_TRASH_NOTES_SUBDIR = "notes";
const NOTE_TRASH_IMAGES_SUBDIR = "img";
const NOTE_TRASH_INDEX_FILE = "index.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const AVATAR_CACHE_PREFIX = "avatar-";
const CUSTOM_BACKGROUND_PREFIX = "background-";
const FONTS_FILE = "fonts.json";
const SETTINGS_FILE = "settings.json";
const UI_STATE_FILE = "ui-state.json";
const AI_DIR = "ai";
const AI_CREDENTIALS_FILE = "credentials.bin";
const AI_PREFERENCES_FILE = "preferences.json";
/** One file per conversation; see `saveAiConversation`. */
const AI_CHATS_DIR = "chats";
/** Legacy single-file store; migrated into `chats/` on the first load. */
const AI_CHATS_FILE = "chats.json";const DATA_DIR_NAME = "data";

let dataDirectoryPromise: Promise<string> | null = null;
let imageNeedDirectoryPromise: Promise<string> | null = null;
let legacyImageTrashMigrationPromise: Promise<void> | null = null;

export type ImageTrashPartition = keyof typeof IMAGE_TRASH_PARTITION_DIRS;

async function ensureDirectory(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function resolveLocalProjectDataDirectory(): Promise<string | null> {
  try {
    const path = (await resourceDir()).replace(/\\/g, "/").replace(/\/+$/, "");
    const match = path.match(/^(.*)\/src-tauri\/target\/(?:debug|release)(?:\/.*)?$/i);
    if (match) return join(match[1], DATA_DIR_NAME);
  } catch {
    // The production path below will surface a useful error if this also fails.
  }
  return null;
}

async function resolveDataDirectory(): Promise<string> {
  if (!import.meta.env.PROD) {
    // Tauri dev runs use the repository's data directory.
    const localProjectData = await resolveLocalProjectDataDirectory();
    if (localProjectData) {
      await ensureDirectory(localProjectData);
      return localProjectData;
    }
  }

  // The executable directory is the single source of truth for installed builds.
  // Never silently switch to AppData, otherwise an existing portable data folder
  // appears to have been lost.
  // On Windows Tauri's executableDir() is unsupported and returns "unknown path".
  // resourceDir() resolves to the folder containing the installed executable.
  const installData = await join(await resourceDir(), DATA_DIR_NAME);
  const isReadOnlyTile = new URLSearchParams(window.location.search).get("tile") === "1";
  if (!isReadOnlyTile) await ensureDirectory(installData);
  return installData;
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

async function ensureAiDir() {
  const base = await getDataRoot();
  const dir = await join(base, AI_DIR);
  await ensureDirectory(dir);
  return dir;
}

export async function getAiDirectory(): Promise<string> {
  return ensureAiDir();
}

/**
 * DPAPI-encrypted AI provider API key as hex, or null when never configured.
 * Decryption happens in Rust; this layer only stores the opaque cipher text.
 */
export async function loadAiCredentialCipher(): Promise<string | null> {
  try {
    const dir = await ensureAiDir();
    const path = await join(dir, AI_CREDENTIALS_FILE);
    if (!(await exists(path))) return null;
    const value = (await readTextFile(path)).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function saveAiCredentialCipher(cipher: string): Promise<void> {
  const dir = await ensureAiDir();
  const path = await join(dir, AI_CREDENTIALS_FILE);
  await writeTextFile(path, cipher);
}

export async function deleteAiCredentialCipher(): Promise<void> {
  try {
    const dir = await ensureAiDir();
    const path = await join(dir, AI_CREDENTIALS_FILE);
    if (await exists(path)) await remove(path);
  } catch {
    // Missing or locked file: treat as already cleared.
  }
}

/**
 * AI assistant preferences (model selection etc.), kept beside the AI
 * credentials so the AI module owns its own restore path. Plain JSON —
 * nothing secret lives here.
 */
export interface StoredAiPreferences {
  /** "local" (小青) or a chat provider id, e.g. "deepseek". */
  chatModel?: string;
  /** Generative provider id used by 润色. */
  polishModel?: string;
  /** Whether DeepSeek-mode turns run a real-time web search. */
  searchEnabled?: boolean;
  /** Note-write permission for the chat assistant (default "readonly"). */
  noteWriteMode?: "readonly" | "full";
}

export async function loadAiPreferences(): Promise<StoredAiPreferences> {
  try {
    const dir = await ensureAiDir();
    const path = await join(dir, AI_PREFERENCES_FILE);
    if (!(await exists(path))) return {};
    const parsed = JSON.parse(await readTextFile(path)) as StoredAiPreferences;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveAiPreferences(prefs: StoredAiPreferences): Promise<void> {
  try {
    const dir = await ensureAiDir();
    const path = await join(dir, AI_PREFERENCES_FILE);
    await writeTextFile(path, JSON.stringify(prefs, null, 2));
  } catch (e) {
    console.error("Failed to save AI preferences:", e);
  }
}

/**
 * AI chat conversations, one JSON file per conversation under `ai/chats/`.
 *
 * The earlier shape kept every conversation in one `chats.json`, so each turn
 * rewrote the whole history — message bodies and retrieved chunks included.
 * Sharding makes a turn's write proportional to that one conversation, and a
 * corrupt file can only cost the session it belongs to.
 *
 * `ai/chats.json` (the old single file) is migrated on first load and removed.
 */
export interface StoredAiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  hits: unknown[];
  streaming?: boolean;
  errorCode?: string;
  /** Web search failed on this turn; drives a hint under the answer. */
  searchError?: boolean;
  /** Web results the answer was built from; rendered as source links. */
  sources?: { title: string; url: string; siteName?: string }[];
  /** The answer hit `max_tokens` and is cut off. */
  truncated?: boolean;
  /** Note writes performed in this turn (full-permission mode), for undo. */
  edits?: {
    noteId: string;
    noteTitle: string;
    snapshotPath: string;
    undone?: boolean;
  }[];
  createdAt: number;
}

export interface StoredAiConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredAiChatMessage[];
}

function isStoredConversation(value: unknown): value is StoredAiConversation {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredAiConversation).id === "string" &&
    Array.isArray((value as StoredAiConversation).messages)
  );
}

/** Conversation ids are UUIDs, but a hand-edited index must not escape the dir. */
function conversationShardName(id: string): string {
  return `${id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
}

async function readConversationFile(path: string): Promise<StoredAiConversation | null> {
  try {
    const parsed = JSON.parse(await readTextFile(path)) as unknown;
    return isStoredConversation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureAiChatsDir(): Promise<string> {
  const dir = await join(await ensureAiDir(), AI_CHATS_DIR);
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

/** Pull every shard, then fold the legacy single file in if it is still there. */
export async function loadAiConversations(): Promise<StoredAiConversation[]> {
  try {
    const base = await ensureAiDir();
    const chatsDir = await ensureAiChatsDir();
    const byId = new Map<string, StoredAiConversation>();

    for (const entry of await readDir(chatsDir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const conversation = await readConversationFile(await join(chatsDir, entry.name));
      if (conversation) byId.set(conversation.id, conversation);
    }

    const legacyPath = await join(base, AI_CHATS_FILE);
    if (await exists(legacyPath)) {
      try {
        const parsed = JSON.parse(await readTextFile(legacyPath)) as unknown;
        const legacy = Array.isArray(parsed) ? parsed.filter(isStoredConversation) : [];
        for (const conversation of legacy) {
          if (byId.has(conversation.id)) continue;
          byId.set(conversation.id, conversation);
          await saveAiConversation(conversation);
        }
        // Only drop the old file once every entry is verifiably on disk as a
        // shard — a failed write must not lose history.
        const sharded = await Promise.all(
          legacy.map(async (conversation) => {
            const path = await join(chatsDir, conversationShardName(conversation.id));
            return exists(path).catch(() => false);
          }),
        );
        if (sharded.every(Boolean)) await remove(legacyPath);
      } catch (e) {
        console.error("Failed to migrate AI conversations:", e);
      }
    }

    return [...byId.values()];
  } catch {
    return [];
  }
}

/** Write one conversation. Called on every turn — the cost is one session. */
export async function saveAiConversation(conversation: StoredAiConversation): Promise<void> {
  try {
    const chatsDir = await ensureAiChatsDir();
    const path = await join(chatsDir, conversationShardName(conversation.id));
    await writeTextFile(path, JSON.stringify(conversation, null, 2));
  } catch (e) {
    console.error("Failed to save AI conversation:", e);
  }
}

export async function deleteAiConversation(id: string): Promise<void> {
  try {
    const chatsDir = await ensureAiChatsDir();
    const path = await join(chatsDir, conversationShardName(id));
    if (await exists(path)) await remove(path);
  } catch {
    // Missing or locked file: treat as already gone.
  }
}

const AI_SNAPSHOTS_DIR = "snapshots";

/**
 * Save a pre-apply content snapshot before an AI rewrite touches a note.
 * Safety net only: a failed snapshot must never block the apply itself.
 * Returns the snapshot path, or null when it could not be written.
 */
export async function savePolishSnapshot(
  noteId: string,
  content: string,
): Promise<string | null> {
  try {
    const aiDir = await ensureAiDir();
    const snapshotDir = await join(aiDir, AI_SNAPSHOTS_DIR, noteId);
    await ensureDirectory(snapshotDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = await join(snapshotDir, `${stamp}.md`);
    await writeTextFile(path, content);
    return path;
  } catch {
    return null;
  }
}

/** Pre-edit state of a note (title + body) captured before an AI write. */
export interface NoteSnapshot {
  title: string;
  content: string;
}

/**
 * Snapshot used by chat-driven note edits. Unlike the polish snapshot it
 * also carries the title, so a rename can be rolled back too. JSON beside
 * the polish snapshots, one file per edit. Safety net only — a failed
 * snapshot must never block the write itself.
 */
export async function saveNoteSnapshot(
  noteId: string,
  snapshot: NoteSnapshot,
): Promise<string | null> {
  try {
    const aiDir = await ensureAiDir();
    const snapshotDir = await join(aiDir, AI_SNAPSHOTS_DIR, noteId);
    await ensureDirectory(snapshotDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = await join(snapshotDir, `${stamp}.json`);
    await writeTextFile(path, JSON.stringify(snapshot));
    return path;
  } catch {
    return null;
  }
}

export async function loadNoteSnapshot(path: string): Promise<NoteSnapshot | null> {
  try {
    if (!(await exists(path))) return null;
    const parsed = JSON.parse(await readTextFile(path)) as NoteSnapshot;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      content: typeof parsed.content === "string" ? parsed.content : "",
    };
  } catch {
    return null;
  }
}

export async function deleteNoteSnapshot(path: string): Promise<void> {
  try {
    if (await exists(path)) await remove(path);
  } catch {
    // Best effort: an orphan snapshot is harmless.
  }
}

/** Current recycle-bin retention in days (0 = disabled, -1 = forever). */export function getTrashRetentionDays(): number {
  return normalizeTrashRetentionDays(useSettingsStore.getState().trashRetentionDays);
}

/** Retention window in milliseconds, or null when entries never expire. */
function getTrashRetentionMs(): number | null {
  const days = getTrashRetentionDays();
  return days === TRASH_RETENTION_FOREVER ? null : days * DAY_MS;
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
    markKnowledgeDirty();
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
      const [content, info] = await Promise.all([readTextFile(path), stat(path)]);
      const modifiedAt = info.mtime?.toISOString() ?? new Date().toISOString();
      return {
        id,
        title: getTitleFromContent(content, id),
        content: "",
        tags: [],
        categoryId: null,
        pinned: false,
        order: index,
        createdAt: modifiedAt,
        updatedAt: modifiedAt,
      };
    }));
    return notes;
  } catch (e) {
    console.error("Failed to recover note list from files:", e);
  }
  return [];
}

interface NoteIndexPayload {
  notes: Note[];
  categories: NoteCategory[];
}

async function readNoteIndexFile(path: string): Promise<NoteIndexPayload | null> {
  if (!(await exists(path))) return null;
  try {
    const parsed = JSON.parse(await readTextFile(path));
    if (Array.isArray(parsed)) return { notes: parsed, categories: [] };
    return {
      notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
      categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
    };
  } catch (error) {
    console.warn("Failed to read note index candidate:", path, error);
    return null;
  }
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
    markKnowledgeDirty();
  } catch (e) {
    console.error("Failed to save todo lists:", e);
  }
}

export async function loadNoteList(): Promise<{ notes: Note[]; categories: NoteCategory[] }> {
  const base = await ensureNotesDir();
  try {
    const [indexPath, backupPath, recovered] = await Promise.all([
      join(base, NOTE_INDEX_FILE),
      join(base, NOTE_INDEX_BACKUP_FILE),
      recoverNoteListFromFiles(base),
    ]);
    const [primary, backup] = await Promise.all([
      readNoteIndexFile(indexPath),
      readNoteIndexFile(backupPath),
    ]);
    const fileIds = new Set(recovered.map((note) => note.id));
    const coverage = (candidate: NoteIndexPayload | null) =>
      candidate?.notes.filter((note) => fileIds.has(note.id)).length ?? -1;
    // Prefer the primary index unless the backup describes more content files.
    // This also restores category definitions and each note's categoryId link.
    const selected = coverage(backup) > coverage(primary) ? backup : primary;
    if (selected) {
      const knownIds = new Set(selected.notes.map((note) => note.id));
      return {
        notes: [...selected.notes, ...recovered.filter((note) => !knownIds.has(note.id))],
        categories: selected.categories,
      };
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
    const indexPath = await join(base, NOTE_INDEX_FILE);
    const backupPath = await join(base, NOTE_INDEX_BACKUP_FILE);
    const tempPath = await join(base, `${NOTE_INDEX_FILE}.tmp`);
    const [primary, backup] = await Promise.all([
      readNoteIndexFile(indexPath),
      readNoteIndexFile(backupPath),
    ]);
    // Preserve the richer previous index. Both files contain category records
    // and each note's categoryId, so the directory tree can be reconstructed.
    if (primary && (!backup || primary.notes.length >= backup.notes.length)) {
      await writeTextFile(backupPath, await readTextFile(indexPath));
    }
    await writeTextFile(tempPath, JSON.stringify({ notes, categories }, null, 2));
    if (await exists(indexPath)) await remove(indexPath);
    await rename(tempPath, indexPath);
    markKnowledgeDirty();
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
    // Name the note so the knowledge index only re-reads this one body.
    markNoteContentDirty(id);
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
    const retentionMs = getTrashRetentionMs();
    if (retentionMs !== null) {
      const expiration = Date.now() - retentionMs;
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

// --- Note Recycle Bin ---
// Layout: <data>/trash/notes/<id>.md, <data>/trash/notes/img/<file>, <data>/trash/notes/index.json.
// The manifest is the single source of truth for metadata, including deletedAt.

export interface TrashNoteEntry {
  id: string;
  title: string;
  tags: string[];
  categoryId: string | null;
  categoryName: string | null;
  pinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  attachments: string[];
}

export interface RestoredTrashNote {
  note: Note;
  missingAttachments: string[];
}

async function ensureNoteTrashDirectories(): Promise<{ notesDir: string; imagesDir: string }> {
  const root = await join(await getDataRoot(), NOTE_TRASH_DIR);
  const notesDir = await join(root, NOTE_TRASH_NOTES_SUBDIR);
  const imagesDir = await join(notesDir, NOTE_TRASH_IMAGES_SUBDIR);
  await ensureDirectory(notesDir);
  await ensureDirectory(imagesDir);
  return { notesDir, imagesDir };
}

function normalizeTrashEntry(raw: unknown): TrashNoteEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id) return null;
  const now = new Date().toISOString();
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    categoryId: typeof value.categoryId === "string" ? value.categoryId : null,
    categoryName: typeof value.categoryName === "string" ? value.categoryName : null,
    pinned: value.pinned === true,
    order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : 0,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : now,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.filter((name): name is string => typeof name === "string")
      : [],
  };
}

async function readTrashIndex(notesDir: string): Promise<TrashNoteEntry[]> {
  const path = await join(notesDir, NOTE_TRASH_INDEX_FILE);
  if (!(await exists(path))) return [];
  try {
    const parsed = JSON.parse(await readTextFile(path));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTrashEntry)
      .filter((entry): entry is TrashNoteEntry => entry !== null);
  } catch (error) {
    console.warn("Failed to read note trash index:", error);
    return [];
  }
}

async function writeTrashIndex(notesDir: string, entries: TrashNoteEntry[]): Promise<void> {
  await writeTextFile(await join(notesDir, NOTE_TRASH_INDEX_FILE), JSON.stringify(entries, null, 2));
}

function collectAttachmentNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(ATTACHMENT_REFERENCE_PATTERN)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}

/** True when the retention window of a trash entry has already elapsed. */
export function isTrashEntryExpired(deletedAt: string, now = Date.now()): boolean {
  const retentionMs = getTrashRetentionMs();
  if (retentionMs === null) return false;
  const deletedTime = Date.parse(deletedAt);
  if (Number.isNaN(deletedTime)) return true;
  return deletedTime + retentionMs <= now;
}

export async function listTrashNotes(): Promise<TrashNoteEntry[]> {
  try {
    const { notesDir } = await ensureNoteTrashDirectories();
    const entries = await readTrashIndex(notesDir);
    const valid: TrashNoteEntry[] = [];
    for (const entry of entries) {
      if (await exists(await join(notesDir, `${entry.id}.md`))) valid.push(entry);
    }
    // Drop manifest records whose content file is gone so the UI never shows ghosts.
    if (valid.length !== entries.length) await writeTrashIndex(notesDir, valid);
    return valid.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
  } catch (error) {
    console.error("Failed to list trash notes:", error);
    return [];
  }
}

/**
 * Move a note into the recycle bin, carrying its image attachments along.
 * When the recycle bin is disabled the note is deleted permanently instead.
 */
export async function moveNoteToTrash(
  note: Note,
  categoryName?: string | null,
): Promise<boolean> {
  try {
    if (getTrashRetentionDays() === TRASH_RETENTION_DISABLED) {
      await deleteNoteFile(note.id);
      return false;
    }

    const notesDir = await ensureNotesDir();
    const sourcePath = await join(notesDir, `${note.id}.md`);
    const hasSourceFile = await exists(sourcePath);
    const content = hasSourceFile ? await readTextFile(sourcePath) : note.content ?? "";
    const { notesDir: trashNotesDir, imagesDir: trashImagesDir } = await ensureNoteTrashDirectories();

    // Write the content first so a crash in the middle never loses text.
    await writeTextFile(await join(trashNotesDir, `${note.id}.md`), content);

    const imageDir = await join(await getDataRoot(), IMAGES_DIR);
    const attachments: string[] = [];
    for (const filename of collectAttachmentNames(content)) {
      const source = await join(imageDir, filename);
      if (!(await exists(source))) continue;
      try {
        const target = await join(trashImagesDir, filename);
        if (await exists(target)) await remove(target);
        await rename(source, target);
        attachments.push(filename);
      } catch (error) {
        console.warn("Failed to move attachment into the note trash:", filename, error);
      }
    }

    if (hasSourceFile) await remove(sourcePath);

    const entry: TrashNoteEntry = {
      id: note.id,
      title: note.title,
      tags: note.tags ?? [],
      categoryId: note.categoryId ?? null,
      categoryName: categoryName ?? null,
      pinned: note.pinned ?? false,
      order: typeof note.order === "number" ? note.order : 0,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      deletedAt: new Date().toISOString(),
      attachments,
    };
    const existing = await readTrashIndex(trashNotesDir);
    await writeTrashIndex(trashNotesDir, [entry, ...existing.filter((item) => item.id !== note.id)]);

    await cleanupUnusedImageAttachments();
    return true;
  } catch (error) {
    console.error("Failed to move note into the recycle bin:", error);
    return false;
  }
}

export async function restoreTrashNote(id: string): Promise<RestoredTrashNote | null> {
  try {
    const { notesDir: trashNotesDir, imagesDir: trashImagesDir } = await ensureNoteTrashDirectories();
    const entries = await readTrashIndex(trashNotesDir);
    const entry = entries.find((item) => item.id === id);
    if (!entry) return null;

    const trashPath = await join(trashNotesDir, `${id}.md`);
    const content = (await exists(trashPath)) ? await readTextFile(trashPath) : "";
    const notesDir = await ensureNotesDir();
    // Restore the content first so image lookups during the next editor load succeed.
    await writeTextFile(await join(notesDir, `${id}.md`), content);

    const imageDir = await ensureImageDir();
    const missingAttachments: string[] = [];
    for (const filename of entry.attachments) {
      const source = await join(trashImagesDir, filename);
      if (!(await exists(source))) {
        missingAttachments.push(filename);
        continue;
      }
      try {
        const target = await join(imageDir, filename);
        if (await exists(target)) {
          await remove(source);
        } else {
          await rename(source, target);
        }
      } catch (error) {
        console.warn("Failed to restore attachment from the note trash:", filename, error);
        missingAttachments.push(filename);
      }
    }

    if (await exists(trashPath)) await remove(trashPath);
    await writeTrashIndex(trashNotesDir, entries.filter((item) => item.id !== id));

    return {
      note: {
        id: entry.id,
        title: entry.title,
        content,
        tags: entry.tags,
        categoryId: entry.categoryId,
        pinned: entry.pinned,
        order: entry.order,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
      missingAttachments,
    };
  } catch (error) {
    console.error("Failed to restore note from the recycle bin:", error);
    return null;
  }
}

export async function purgeTrashNote(id: string): Promise<void> {
  try {
    const { notesDir: trashNotesDir, imagesDir: trashImagesDir } = await ensureNoteTrashDirectories();
    const entries = await readTrashIndex(trashNotesDir);
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;

    const trashPath = await join(trashNotesDir, `${id}.md`);
    if (await exists(trashPath)) await remove(trashPath);
    for (const filename of entry.attachments) {
      const attachmentPath = await join(trashImagesDir, filename);
      if (await exists(attachmentPath)) await remove(attachmentPath);
    }
    await writeTrashIndex(trashNotesDir, entries.filter((item) => item.id !== id));
  } catch (error) {
    console.error("Failed to purge a trash note:", error);
  }
}

export async function emptyNoteTrash(): Promise<void> {
  try {
    const { notesDir: trashNotesDir, imagesDir: trashImagesDir } = await ensureNoteTrashDirectories();
    for (const entry of await readDir(trashNotesDir)) {
      if (!entry.isFile || !entry.name?.toLowerCase().endsWith(".md")) continue;
      await remove(await join(trashNotesDir, entry.name));
    }
    for (const entry of await readDir(trashImagesDir)) {
      if (!entry.isFile || !entry.name) continue;
      await remove(await join(trashImagesDir, entry.name));
    }
    await writeTrashIndex(trashNotesDir, []);
  } catch (error) {
    console.error("Failed to empty the note recycle bin:", error);
  }
}

/** Delete every trash entry whose retention window has elapsed. */
export async function purgeExpiredNoteTrash(now = Date.now()): Promise<number> {
  try {
    const { notesDir: trashNotesDir, imagesDir: trashImagesDir } = await ensureNoteTrashDirectories();
    const entries = await readTrashIndex(trashNotesDir);
    if (entries.length === 0) return 0;

    const keep: TrashNoteEntry[] = [];
    const expired: TrashNoteEntry[] = [];
    for (const entry of entries) {
      if (isTrashEntryExpired(entry.deletedAt, now)) {
        expired.push(entry);
      } else {
        keep.push(entry);
      }
    }
    if (expired.length === 0) return 0;

    for (const entry of expired) {
      const trashPath = await join(trashNotesDir, `${entry.id}.md`);
      if (await exists(trashPath)) await remove(trashPath);
      for (const filename of entry.attachments) {
        const attachmentPath = await join(trashImagesDir, filename);
        if (await exists(attachmentPath)) await remove(attachmentPath);
      }
    }
    await writeTrashIndex(trashNotesDir, keep);
    return expired.length;
  } catch (error) {
    console.error("Failed to purge expired trash notes:", error);
    return 0;
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

// --- UI session state (open note tabs) ---
// Kept in its own file so that a corrupted or reset tab session can never
// damage user settings, and so the settings payload stays a pure preference bag.
export interface StoredUiState {
  tabs: { id: string }[];
  activeId: string | null;
}

export async function loadUiState(): Promise<StoredUiState> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, UI_STATE_FILE);
    if (await exists(path)) {
      const content = await readTextFile(path);
      const parsed = JSON.parse(content) as Partial<StoredUiState>;
      return {
        tabs: Array.isArray(parsed.tabs)
          ? parsed.tabs.filter((tab): tab is { id: string } => typeof tab?.id === "string")
          : [],
        activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      };
    }
  } catch (e) {
    console.error("Failed to load ui state:", e);
  }
  return { tabs: [], activeId: null };
}

export async function saveUiState(state: StoredUiState): Promise<void> {
  try {
    const base = await ensureDataDir();
    const path = await join(base, UI_STATE_FILE);
    await writeTextFile(path, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save ui state:", e);
  }
}
