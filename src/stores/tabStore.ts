import { create } from "zustand";
import { useNoteStore } from "@/stores/noteStore";

/**
 * A single open note tab.
 *
 * `preview` mirrors the editor convention popularised by VS Code: a single
 * click in the sidebar opens a *preview* tab that the next single click
 * replaces, while a double click (or any content edit) promotes it to a
 * pinned tab. Preview tabs are never persisted, so a restart never restores a
 * half-open note the user never really committed to.
 */
export interface NoteTab {
  id: string;
  preview: boolean;
}

export type TabDropPosition = "before" | "after";

interface TabState {
  tabs: NoteTab[];
  /** Note ids whose editor content differs from what is on disk. */
  dirtyIds: string[];
  /** False until the persisted session has been read, so the initial empty
   *  state never overwrites a real session on disk. */
  hydrated: boolean;

  openTab: (noteId: string, options?: { preview?: boolean }) => void;
  pinTab: (noteId: string) => void;
  closeTab: (noteId: string) => void;
  closeOtherTabs: (noteId: string) => void;
  closeTabsToRight: (noteId: string) => void;
  closeAllTabs: () => void;
  /** Drops `fromId` at `index` measured against the tabs that stay in place. */
  moveTabToIndex: (fromId: string, index: number) => void;
  moveTab: (fromId: string, toId: string, position?: TabDropPosition) => void;
  markDirty: (noteId: string, dirty: boolean) => void;
  /** Drop tabs (and dirty flags) whose note no longer exists. */
  pruneMissing: (validIds: Iterable<string>) => void;
  restoreTabs: (ids: string[], activeId: string | null, validIds: Iterable<string>) => void;
  markHydrated: () => void;
}

const withoutId = (ids: string[], noteId: string) => ids.filter((id) => id !== noteId);

/** Activating the already-active note must not churn the note store. */
function activateIfNeeded(noteId: string) {
  const noteStore = useNoteStore.getState();
  if (noteStore.activeNoteId !== noteId) noteStore.setActiveNoteId(noteId);
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  dirtyIds: [],
  hydrated: false,

  openTab: (noteId, options) => {
    const preview = options?.preview ?? false;
    const { tabs } = get();
    const existing = tabs.find((tab) => tab.id === noteId);

    if (existing) {
      // Re-opening an already open note activates it; asking for a pinned open
      // promotes an existing preview tab in place, keeping its position.
      if (!preview && existing.preview) {
        set({ tabs: tabs.map((tab) => (tab.id === noteId ? { ...tab, preview: false } : tab)) });
      }
    } else if (preview) {
      // A preview open reuses the preview slot instead of growing the strip.
      const previewIndex = tabs.findIndex((tab) => tab.preview);
      set({
        tabs: previewIndex >= 0
          ? tabs.map((tab, index) => (index === previewIndex ? { id: noteId, preview: true } : tab))
          : [...tabs, { id: noteId, preview: true }],
      });
    } else {
      set({ tabs: [...tabs, { id: noteId, preview: false }] });
    }

    activateIfNeeded(noteId);
  },

  pinTab: (noteId) => {
    const { tabs } = get();
    if (!tabs.some((tab) => tab.id === noteId)) {
      set({ tabs: [...tabs, { id: noteId, preview: false }] });
    } else {
      set({ tabs: tabs.map((tab) => (tab.id === noteId ? { ...tab, preview: false } : tab)) });
    }
    activateIfNeeded(noteId);
  },

  closeTab: (noteId) => {
    const { tabs, dirtyIds } = get();
    const index = tabs.findIndex((tab) => tab.id === noteId);
    if (index < 0) return;

    const nextTabs = tabs.filter((tab) => tab.id !== noteId);
    set({ tabs: nextTabs, dirtyIds: withoutId(dirtyIds, noteId) });

    // Closing the active tab falls through to its right neighbour, then left.
    if (useNoteStore.getState().activeNoteId === noteId) {
      const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? null;
      useNoteStore.getState().setActiveNoteId(fallback?.id ?? null);
    }
  },

  closeOtherTabs: (noteId) => {
    const { tabs, dirtyIds } = get();
    const nextTabs = tabs.filter((tab) => tab.id === noteId);
    if (nextTabs.length === tabs.length) return;
    set({ tabs: nextTabs, dirtyIds: dirtyIds.filter((id) => id === noteId) });
    useNoteStore.getState().setActiveNoteId(noteId);
  },

  closeTabsToRight: (noteId) => {
    const { tabs, dirtyIds } = get();
    const index = tabs.findIndex((tab) => tab.id === noteId);
    if (index < 0 || index === tabs.length - 1) return;
    const nextTabs = tabs.slice(0, index + 1);
    const keptIds = new Set(nextTabs.map((tab) => tab.id));
    set({ tabs: nextTabs, dirtyIds: dirtyIds.filter((id) => keptIds.has(id)) });

    const activeId = useNoteStore.getState().activeNoteId;
    if (activeId && !keptIds.has(activeId)) {
      useNoteStore.getState().setActiveNoteId(noteId);
    }
  },

  closeAllTabs: () => {
    set({ tabs: [], dirtyIds: [] });
    useNoteStore.getState().setActiveNoteId(null);
  },

  moveTabToIndex: (fromId, index) => {
    const tabs = [...get().tabs];
    const fromIndex = tabs.findIndex((tab) => tab.id === fromId);
    if (fromIndex < 0) return;

    const [moved] = tabs.splice(fromIndex, 1);
    const target = Math.max(0, Math.min(index, tabs.length));
    if (target === fromIndex) return;
    tabs.splice(target, 0, moved);
    set({ tabs });
  },

  moveTab: (fromId, toId, position = "before") => {
    if (fromId === toId) return;
    const without = get().tabs.filter((tab) => tab.id !== fromId);
    const targetIndex = without.findIndex((tab) => tab.id === toId);
    if (targetIndex < 0) return;
    get().moveTabToIndex(fromId, targetIndex + (position === "after" ? 1 : 0));
  },

  markDirty: (noteId, dirty) => {
    const { dirtyIds, tabs } = get();
    const isDirty = dirtyIds.includes(noteId);
    // Editing a preview tab promotes it, matching the "any content change pins
    // the tab" rule so a half-typed note can never be replaced by a stray click.
    const needsPin = dirty && tabs.some((tab) => tab.id === noteId && tab.preview);
    if (dirty === isDirty && !needsPin) return;
    set({
      dirtyIds: dirty
        ? isDirty ? dirtyIds : [...dirtyIds, noteId]
        : withoutId(dirtyIds, noteId),
      tabs: needsPin
        ? tabs.map((tab) => (tab.id === noteId ? { ...tab, preview: false } : tab))
        : tabs,
    });
  },

  pruneMissing: (validIds) => {
    const valid = new Set(validIds);
    const { tabs, dirtyIds } = get();
    const removedIndex = tabs.findIndex((tab) => !valid.has(tab.id));
    if (removedIndex < 0) return;

    const activeId = useNoteStore.getState().activeNoteId;
    const nextTabs = tabs.filter((tab) => valid.has(tab.id));
    set({
      tabs: nextTabs,
      dirtyIds: dirtyIds.filter((id) => valid.has(id)),
    });

    // The deleted note may have been the active one; fall through to a
    // neighbour so the editor does not appear empty while tabs remain.
    if (activeId && !valid.has(activeId) && nextTabs.length > 0) {
      const fallback = nextTabs[Math.min(removedIndex, nextTabs.length - 1)];
      useNoteStore.getState().setActiveNoteId(fallback.id);
    }
  },

  restoreTabs: (ids, activeId, validIds) => {
    const valid = new Set(validIds);
    const seen = new Set<string>();
    const tabs: NoteTab[] = [];
    for (const id of ids) {
      if (!valid.has(id) || seen.has(id)) continue;
      seen.add(id);
      tabs.push({ id, preview: false });
    }
    set({ tabs, hydrated: true });

    const target = activeId && seen.has(activeId) ? activeId : tabs[0]?.id ?? null;
    useNoteStore.getState().setActiveNoteId(target);
  },

  markHydrated: () => set({ hydrated: true }),
}));
