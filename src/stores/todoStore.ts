import { create } from "zustand";
import type { Todo } from "@/types";

interface TodoState {
  todos: Todo[];
  filter: "all" | "active" | "completed";
  addTodo: (title: string, priority?: Todo["priority"]) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  reorderTodos: (fromIndex: number, toIndex: number) => void;
  setFilter: (filter: TodoState["filter"]) => void;
  loadTodos: (todos: Todo[]) => void;
}

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  filter: "all",

  addTodo: (title, priority = "medium") =>
    set((state) => ({
      todos: [
        ...state.todos,
        {
          id: crypto.randomUUID(),
          title,
          completed: false,
          priority,
          createdAt: new Date().toISOString(),
          order: state.todos.length,
        },
      ],
    })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    })),

  deleteTodo: (id) =>
    set((state) => ({
      todos: state.todos.filter((t) => t.id !== id),
    })),

  updateTodo: (id, updates) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  reorderTodos: (fromIndex, toIndex) =>
    set((state) => {
      const items = [...state.todos];
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      return { todos: items.map((t, i) => ({ ...t, order: i })) };
    }),

  setFilter: (filter) => set({ filter }),

  loadTodos: (todos) => set({ todos }),
}));
