import { create } from "zustand";
import type { Note, NoteCategory } from "@/types";

export const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
export type DropPosition = "before" | "after";

const getNoteGroupKey = (note: Pick<Note, "categoryId" | "pinned">) =>
  JSON.stringify([note.categoryId ?? null, note.pinned ?? false]);

function normalizeNoteOrders(notes: Note[]): Note[] {
  const nextOrderByGroup = new Map<string, number>();
  const orderById = new Map<string, number>();

  [...notes]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((note) => {
      const groupKey = getNoteGroupKey(note);
      const nextOrder = nextOrderByGroup.get(groupKey) ?? 0;
      orderById.set(note.id, nextOrder);
      nextOrderByGroup.set(groupKey, nextOrder + 1);
    });

  return notes.map((note) => ({ ...note, order: orderById.get(note.id) ?? 0 }));
}

function getNextNoteOrder(
  notes: Note[],
  categoryId: string | null | undefined,
  pinned: boolean,
  excludedId?: string,
): number {
  return Math.max(
    -1,
    ...notes
      .filter((note) =>
        note.id !== excludedId &&
        (note.categoryId ?? null) === (categoryId ?? null) &&
        (note.pinned ?? false) === pinned
      )
      .map((note) => note.order ?? 0),
  ) + 1;
}

function normalizeNotes(notes: Note[]): Note[] {
  return normalizeNoteOrders(notes.map((note, index) => ({
    ...note,
    categoryId: note.categoryId === UNCATEGORIZED_CATEGORY_ID ? null : note.categoryId ?? null,
    pinned: note.pinned ?? false,
    order: typeof note.order === "number" ? note.order : index,
  })));
}

function normalizeCategories(categories: NoteCategory[]): NoteCategory[] {
  return categories.map((category, index) => ({
    ...category,
    order: typeof category.order === "number" ? category.order : index,
  }));
}

interface NoteState {
  notes: Note[];
  categories: NoteCategory[];
  activeNoteId: string | null;
  searchQuery: string;
  filterTag: string | null;
  activeCategoryId: string | null;
  setActiveNoteId: (id: string | null) => void;
  setActiveCategoryId: (id: string | null) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>, options?: { touchUpdatedAt?: boolean }) => void;
  deleteNote: (id: string) => void;
  addCategory: (name: string) => void;
  updateCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  reorderCategories: (fromIndex: number, toIndex: number, position?: DropPosition) => void;
  reorderNotes: (fromId: string, toId: string, position?: DropPosition) => void;
  togglePinned: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
  loadNotes: (notes: Note[], categories?: NoteCategory[]) => void;
  getFilteredNotes: () => Note[];
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  categories: [],
  activeNoteId: null,
  searchQuery: "",
  filterTag: null,
  activeCategoryId: null,

  setActiveNoteId: (id) => set({ activeNoteId: id }),
  setActiveCategoryId: (id) => set({ activeCategoryId: id }),

  addNote: (note) =>
    set((state) => {
      const notes = [
        {
          ...note,
          categoryId:
            note.categoryId === UNCATEGORIZED_CATEGORY_ID
              ? null
              : note.categoryId ??
                (state.activeCategoryId === UNCATEGORIZED_CATEGORY_ID ? null : state.activeCategoryId),
          pinned: note.pinned ?? false,
          order: Math.min(0, ...state.notes.map((n) => n.order ?? 0)) - 1,
        },
        ...state.notes,
      ];
      return {
        notes: normalizeNoteOrders(notes),
        activeNoteId: note.id,
      };
    }),

  updateNote: (id, updates, options) =>
    set((state) => {
      const current = state.notes.find((note) => note.id === id);
      if (!current) return state;

      const hasCategoryUpdate = Object.prototype.hasOwnProperty.call(updates, "categoryId");
      const categoryId = hasCategoryUpdate
        ? updates.categoryId === UNCATEGORIZED_CATEGORY_ID ? null : updates.categoryId ?? null
        : current.categoryId ?? null;
      const pinned = typeof updates.pinned === "boolean"
        ? updates.pinned
        : current.pinned ?? false;
      const groupChanged =
        categoryId !== (current.categoryId ?? null) || pinned !== (current.pinned ?? false);
      const normalizedUpdates = hasCategoryUpdate ? { ...updates, categoryId } : updates;
      const order = groupChanged
        ? getNextNoteOrder(state.notes, categoryId, pinned, id)
        : updates.order ?? current.order;
      const notes = state.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              ...normalizedUpdates,
              order,
              updatedAt: options?.touchUpdatedAt === false ? note.updatedAt : new Date().toISOString(),
            }
          : note
      );
      return { notes: groupChanged ? normalizeNoteOrders(notes) : notes };
    }),

  deleteNote: (id) =>
    set((state) => {
      const note = state.notes.find((n) => n.id === id);
      if (note?.pinned) return state;

      return {
        notes: state.notes.filter((n) => n.id !== id),
        activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
      };
    }),

  addCategory: (name) =>
    set((state) => {
      const now = new Date().toISOString();
      const category: NoteCategory = {
        id: crypto.randomUUID(),
        name: name.trim(),
        order: Math.max(-1, ...state.categories.map((c) => c.order)) + 1,
        createdAt: now,
      };
      return {
        categories: [...state.categories, category],
        activeCategoryId: category.id,
      };
    }),

  updateCategory: (id, name) =>
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id ? { ...category, name: name.trim() } : category
      ),
    })),

  deleteCategory: (id) =>
    set((state) => {
      const notes = state.notes.map((note) =>
        note.categoryId === id ? { ...note, categoryId: null, updatedAt: new Date().toISOString() } : note
      );
      return {
        categories: state.categories.filter((category) => category.id !== id),
        notes: normalizeNoteOrders(notes),
        activeCategoryId: state.activeCategoryId === id ? null : state.activeCategoryId,
      };
    }),

  reorderCategories: (fromIndex, toIndex, position = "before") =>
    set((state) => {
      const categories = [...state.categories].sort((a, b) => a.order - b.order);
      const targetId = categories[toIndex]?.id;
      const [moved] = categories.splice(fromIndex, 1);
      if (!moved || !targetId || moved.id === targetId) return state;
      const targetIndex = categories.findIndex((category) => category.id === targetId);
      if (targetIndex < 0) return state;
      categories.splice(targetIndex + (position === "after" ? 1 : 0), 0, moved);
      return {
        categories: categories.map((category, index) => ({ ...category, order: index })),
      };
    }),

  reorderNotes: (fromId, toId, position = "before") =>
    set((state) => {
      const fromNote = state.notes.find((note) => note.id === fromId);
      const toNote = state.notes.find((note) => note.id === toId);
      if (!fromNote || !toNote || fromNote.pinned || toNote.pinned) return state;

      const categoryId = fromNote.categoryId ?? null;
      if ((toNote.categoryId ?? null) !== categoryId) return state;

      const orderedIds = state.notes
        .filter((note) => !note.pinned && (note.categoryId ?? null) === categoryId)
        .sort((a, b) => a.order - b.order)
        .map((note) => note.id);
      const fromIndex = orderedIds.indexOf(fromId);
      const toIndex = orderedIds.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state;

       const [movedId] = orderedIds.splice(fromIndex, 1);
       const targetIndex = orderedIds.indexOf(toId);
       if (targetIndex < 0) return state;
       orderedIds.splice(targetIndex + (position === "after" ? 1 : 0), 0, movedId);
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));

      const notes = state.notes.map((note) => {
          const nextOrder = orderById.get(note.id);
          return typeof nextOrder === "number" ? { ...note, order: nextOrder } : note;
        });
      return { notes: normalizeNoteOrders(notes) };
    }),

  togglePinned: (id) =>
    set((state) => {
      const current = state.notes.find((note) => note.id === id);
      if (!current) return state;

      const pinned = !(current.pinned ?? false);
      const order = getNextNoteOrder(state.notes, current.categoryId, pinned, id);
      const notes = state.notes.map((note) =>
        note.id === id
          ? { ...note, pinned, order, updatedAt: new Date().toISOString() }
          : note
      );
      return { notes: normalizeNoteOrders(notes) };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilterTag: (tag) => set({ filterTag: tag }),

  loadNotes: (notes, categories = []) =>
    set({
      notes: normalizeNotes(notes),
      categories: normalizeCategories(categories),
    }),

  getFilteredNotes: () => {
    const { notes, searchQuery, filterTag, activeCategoryId } = get();
    return notes.filter((n) => {
      const matchesSearch =
        !searchQuery ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = !filterTag || n.tags.includes(filterTag);
      const matchesCategory =
        !activeCategoryId ||
        (activeCategoryId === UNCATEGORIZED_CATEGORY_ID
          ? !n.categoryId
          : (n.categoryId ?? null) === activeCategoryId);
      return matchesSearch && matchesTag && matchesCategory;
    }).sort((a, b) => {
      if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1;
      return a.order - b.order;
    });
  },
}));
