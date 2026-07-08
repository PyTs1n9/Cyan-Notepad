import { create } from "zustand";
import type { Todo } from "@/types";

const normalizeTodos = (items: Todo[]): Todo[] =>
  items.map((todo, index) => ({
    ...todo,
    pinned: todo.pinned ?? false,
    order: typeof todo.order === "number" ? todo.order : index,
  }));

/** Pinned items stay on top, then active items, while preserving manual order within each group. */
const sortTodos = (items: Todo[]): Todo[] =>
  [...items].sort((a, b) => {
    if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });

interface TodoState {
  todos: Todo[];
  filter: "all" | "active" | "completed";
  priorityFilter: "all" | "low" | "medium" | "high";
  addTodo: (title: string, priority?: Todo["priority"], dueDate?: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  togglePinned: (id: string) => void;
  reorderTodos: (fromIndex: number, toIndex: number) => void;
  setFilter: (filter: TodoState["filter"]) => void;
  setPriorityFilter: (filter: TodoState["priorityFilter"]) => void;
  loadTodos: (todos: Todo[]) => void;
}

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  filter: "all",
  priorityFilter: "all",

  addTodo: (title, priority = "low", dueDate) =>
    set((state) => ({
      todos: sortTodos([
        ...state.todos,
        {
          id: crypto.randomUUID(),
          title,
          completed: false,
          priority,
          pinned: false,
          dueDate,
          createdAt: new Date().toISOString(),
          order: state.todos.length,
        },
      ]),
    })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: sortTodos(
        state.todos.map((t) =>
          t.id === id ? { ...t, completed: !t.completed } : t
        )
      ),
    })),

  deleteTodo: (id) =>
    set((state) => {
      const todo = state.todos.find((t) => t.id === id);
      if (todo?.pinned) return state;

      return {
        todos: state.todos.filter((t) => t.id !== id),
      };
    }),

  updateTodo: (id, updates) =>
    set((state) => ({
      todos: sortTodos(state.todos.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      )),
    })),

  togglePinned: (id) =>
    set((state) => ({
      todos: sortTodos(
        state.todos.map((t) =>
          t.id === id ? { ...t, pinned: !(t.pinned ?? false) } : t
        )
      ),
    })),

  reorderTodos: (fromIndex, toIndex) =>
    set((state) => {
      const items = [...state.todos];
      const [moved] = items.splice(fromIndex, 1);
      if (!moved || moved.pinned) return state;
      items.splice(toIndex, 0, moved);
      return { todos: sortTodos(items.map((t, i) => ({ ...t, order: i }))) };
    }),

  setFilter: (filter) => set({ filter }),

  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),

  loadTodos: (todos) => set({ todos: sortTodos(normalizeTodos(todos)) }),
}));
