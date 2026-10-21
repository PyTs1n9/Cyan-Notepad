import { useNoteStore } from "@/stores/noteStore";
import { flushActiveNote } from "@/utils/noteFlush";
import { moveNoteToTrash } from "@/utils/storage";
import type { Note } from "@/types";

/**
 * Deletes a note the same way the sidebar confirmation does: pending editor
 * edits are flushed first, the note leaves the index, then the file moves to the
 * recycle bin (or is deleted outright when the bin is disabled).
 */
export async function deleteNoteToTrash(note: Note): Promise<void> {
  const store = useNoteStore.getState();
  const categoryName = note.categoryId
    ? store.categories.find((category) => category.id === note.categoryId)?.name ?? null
    : null;
  await flushActiveNote(note.id).catch((error: unknown) => {
    // A failed flush must not block the delete; the trashed file just keeps the
    // last persisted content.
    console.warn("flushActiveNote failed before deleting:", error);
  });
  useNoteStore.getState().deleteNote(note.id);
  await moveNoteToTrash(note, categoryName);
}
