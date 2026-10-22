/**
 * Knowledge-index staleness flag. Lives in a dependency-free leaf module so
 * the data layer (`storage.ts`, `canvasStorage.ts`) can invalidate the index
 * on every content write without importing the retrieval stack (which reads
 * back through the data layer — the cycle is cut right here).
 *
 * Two granularities:
 *  - `markKnowledgeDirty()` — "some document set changed, rebuild the index".
 *  - `markNoteContentDirty(id)` — additionally names the note whose body
 *    changed, so a rebuild can reuse the cached bodies of every other note
 *    instead of reading them all from disk again.
 */

let dirty = true;
const dirtyNoteIds = new Set<string>();
const dirtyCanvasIds = new Set<string>();

export function markKnowledgeDirty(): void {
  dirty = true;
}

export function markNoteContentDirty(noteId: string): void {
  dirty = true;
  dirtyNoteIds.add(noteId);
}

export function markCanvasContentDirty(canvasId: string): void {
  dirty = true;
  dirtyCanvasIds.add(canvasId);
}

export function isKnowledgeDirty(): boolean {
  return dirty;
}

export function clearKnowledgeDirty(): void {
  dirty = false;
}

/**
 * Note ids whose body changed since the last build. Reading the set clears it:
 * the caller is about to re-read exactly those bodies.
 */
export function consumeDirtyNoteIds(): Set<string> {
  const pending = new Set(dirtyNoteIds);
  dirtyNoteIds.clear();
  return pending;
}

/** Same contract as `consumeDirtyNoteIds`, for canvas boards. */
export function consumeDirtyCanvasIds(): Set<string> {
  const pending = new Set(dirtyCanvasIds);
  dirtyCanvasIds.clear();
  return pending;
}
