import { create } from "zustand";
import type { Note } from "@/types";

interface NoteState {
  notes: Note[];
  activeNoteId: string | null;
  searchQuery: string;
  filterTag: string | null;
  setActiveNoteId: (id: string | null) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
  loadNotes: (notes: Note[]) => void;
  getFilteredNotes: () => Note[];
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  activeNoteId: null,
  searchQuery: "",
  filterTag: null,

  setActiveNoteId: (id) => set({ activeNoteId: id }),

  addNote: (note) =>
    set((state) => ({
      notes: [note, ...state.notes],
      activeNoteId: note.id,
    })),

  updateNote: (id, updates) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      ),
    })),

  deleteNote: (id) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilterTag: (tag) => set({ filterTag: tag }),

  loadNotes: (notes) => set({ notes }),

  getFilteredNotes: () => {
    const { notes, searchQuery, filterTag } = get();
    return notes.filter((n) => {
      const matchesSearch =
        !searchQuery ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag = !filterTag || n.tags.includes(filterTag);
      return matchesSearch && matchesTag;
    });
  },
}));
