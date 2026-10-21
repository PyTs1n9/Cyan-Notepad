/**
 * Bridge that lets non-editor code (the sidebar) flush pending editor changes
 * before a note is destroyed. Without it, content typed since the last save
 * would never reach the file that gets moved into the recycle bin.
 */
type NoteFlusher = (noteId: string) => Promise<void>;

let activeFlusher: NoteFlusher | null = null;

export function registerNoteFlusher(flusher: NoteFlusher | null): void {
  activeFlusher = flusher;
}

export async function flushActiveNote(noteId: string): Promise<void> {
  try {
    await activeFlusher?.(noteId);
  } catch (error) {
    console.warn("Failed to flush the active note before deleting it:", error);
  }
}
