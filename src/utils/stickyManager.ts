import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// Track open sticky windows (key: noteId, value: window label)
const openStickies = new Map<string, string>();
// Counter for generating unique labels
let stickyCounter = 0;

export async function createStickyNote(noteId: string): Promise<void> {
  // If already open, just focus it
  const existingLabel = openStickies.get(noteId);
  if (existingLabel) {
    try {
      const existing = new WebviewWindow(existingLabel);
      await existing.setFocus();
      return;
    } catch {
      // Window no longer exists, remove from tracking
      openStickies.delete(noteId);
    }
  }

  // Generate unique label to avoid Tauri v2 label reuse issues
  const label = `sticky-${noteId}-${Date.now()}-${stickyCounter++}`;
  openStickies.set(noteId, label);

  // Create new sticky window
  const webview = new WebviewWindow(label, {
    url: `/?sticky=${noteId}`,
    title: "Sticky Note",
    width: 320,
    height: 400,
    minWidth: 200,
    minHeight: 200,
    decorations: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    visible: false, // Hidden initially to avoid flash
  });

  webview.once("tauri://created", async () => {
    try {
      await webview.show();
    } catch {
      // ignore
    }
  });

  webview.once("tauri://error", (e) => {
    console.error("Failed to create sticky note:", e);
    openStickies.delete(noteId);
  });

  // Clean up tracking when window is destroyed
  webview.once("tauri://destroyed", () => {
    openStickies.delete(noteId);
  });
}

export function isStickyOpen(noteId: string): boolean {
  return openStickies.has(noteId);
}

export async function closeStickyNote(noteId: string): Promise<void> {
  const label = openStickies.get(noteId);
  if (!label) return;
  try {
    const win = new WebviewWindow(label);
    await win.close();
    openStickies.delete(noteId);
  } catch {
    // Window already doesn't exist
    openStickies.delete(noteId);
  }
}
