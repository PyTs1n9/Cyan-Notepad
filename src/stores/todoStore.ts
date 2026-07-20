import { create } from "zustand";
import type { Todo, TodoList, TodoListData } from "@/types";

type DropPosition = "before" | "after";

const normalizeTodos = (items: Todo[], fallbackListId: string): Todo[] =>
  normalizeTodoOrders(items.map((todo, index) => ({
    ...todo,
    listId: todo.listId || fallbackListId,
    pinned: todo.pinned ?? false,
    order: typeof todo.order === "number" ? todo.order : index,
  })));

function normalizeTodoOrders(items: Todo[]): Todo[] {
  const nextOrderByGroup = new Map<string, number>();
  const orderById = new Map<string, number>();

  [...items]
    .sort((a, b) => a.order - b.order)
    .forEach((todo) => {
      const groupKey = JSON.stringify([todo.listId, todo.pinned ?? false, todo.completed]);
      const nextOrder = nextOrderByGroup.get(groupKey) ?? 0;
      orderById.set(todo.id, nextOrder);
      nextOrderByGroup.set(groupKey, nextOrder + 1);
    });

  return items.map((todo) => ({ ...todo, order: orderById.get(todo.id) ?? 0 }));
}

function getNextTodoOrder(
  items: Todo[],
  current: Todo,
  pinned: boolean,
): number {
  return Math.max(
    -1,
    ...items
      .filter((todo) =>
        todo.id !== current.id &&
        todo.listId === current.listId &&
        (todo.pinned ?? false) === pinned &&
        todo.completed === current.completed
      )
      .map((todo) => todo.order),
  ) + 1;
}

/** Pinned items stay on top, then active items, while preserving manual order within each group. */
const sortTodos = (items: Todo[]): Todo[] =>
  [...items].sort((a, b) => {
    if ((a.pinned ?? false) !== (b.pinned ?? false)) return a.pinned ? -1 : 1;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.order - b.order;
  });

const sortLists = (items: TodoList[]): TodoList[] =>
  [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.order - b.order;
  });

const createList = (name: string, order = 0): TodoList => ({
  id: crypto.randomUUID(),
  name,
  pinned: false,
  order,
  createdAt: new Date().toISOString(),
});

const normalizeLists = (items: TodoList[]): TodoList[] => {
  const sorted = sortLists(items.map((list, index) => ({
    ...list,
    pinned: list.pinned ?? false,
    order: typeof list.order === "number" ? list.order : index,
    createdAt: list.createdAt || new Date().toISOString(),
  })));
  let pinnedOrder = 0;
  let regularOrder = 0;
  return sorted.map((list) => ({
    ...list,
    order: list.pinned ? pinnedOrder++ : regularOrder++,
  }));
};

interface TodoState {
  todos: Todo[];
  lists: TodoList[];
  activeListId: string | null;
  filter: "all" | "active" | "completed";
  priorityFilter: "all" | "low" | "medium" | "high";
  addTodo: (title: string, priority?: Todo["priority"], dueDate?: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  togglePinned: (id: string) => void;
  reorderTodos: (todoId: string, targetTodoId: string, position?: DropPosition) => void;
  addList: (name: string) => string;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string, fallbackName: string) => void;
  toggleListPinned: (id: string) => void;
  reorderLists: (listId: string, targetListId: string, position?: DropPosition) => void;
  setActiveList: (id: string) => void;
  setFilter: (filter: TodoState["filter"]) => void;
  setPriorityFilter: (filter: TodoState["priorityFilter"]) => void;
  loadTodoData: (todos: Todo[], listData: TodoListData | null, defaultListName: string) => void;
}

export const useTodoStore = create<TodoState>((set) => ({
  todos: [],
  lists: [],
  activeListId: null,
  filter: "all",
  priorityFilter: "all",

  addTodo: (title, priority = "low", dueDate) =>
    set((state) => {
      if (!state.activeListId) return state;
      const listTodos = state.todos.filter((todo) => todo.listId === state.activeListId);
      return {
        todos: sortTodos([
          ...state.todos,
          {
            id: crypto.randomUUID(),
            listId: state.activeListId,
            title,
            completed: false,
            priority,
            pinned: false,
            dueDate,
            createdAt: new Date().toISOString(),
            order: listTodos.length,
          },
        ]),
      };
    }),

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
    set((state) => {
      const current = state.todos.find((todo) => todo.id === id);
      if (!current) return state;

      const pinned = !(current.pinned ?? false);
      const order = getNextTodoOrder(state.todos, current, pinned);
      const todos = state.todos.map((todo) =>
        todo.id === id ? { ...todo, pinned, order } : todo
      );
      return { todos: sortTodos(normalizeTodoOrders(todos)) };
    }),

  reorderTodos: (todoId, targetTodoId, position = "before") =>
    set((state) => {
      const moved = state.todos.find((todo) => todo.id === todoId);
      const target = state.todos.find((todo) => todo.id === targetTodoId);
      if (!moved || !target || moved.pinned || target.pinned || moved.listId !== target.listId) return state;

      const listItems = sortTodos(state.todos.filter((todo) => todo.listId === moved.listId));
      const fromIndex = listItems.findIndex((todo) => todo.id === todoId);
      const toIndex = listItems.findIndex((todo) => todo.id === targetTodoId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state;

       const [reordered] = listItems.splice(fromIndex, 1);
       const targetIndex = listItems.findIndex((todo) => todo.id === targetTodoId);
       if (targetIndex < 0) return state;
       listItems.splice(targetIndex + (position === "after" ? 1 : 0), 0, reordered);
      const orderById = new Map(listItems.map((todo, index) => [todo.id, index]));
      const todos = state.todos.map((todo) =>
          orderById.has(todo.id) ? { ...todo, order: orderById.get(todo.id)! } : todo
        );
      return { todos: sortTodos(normalizeTodoOrders(todos)) };
    }),

  addList: (name) => {
    const id = crypto.randomUUID();
    set((state) => ({
      lists: sortLists([
        ...state.lists,
        {
          id,
          name,
          pinned: false,
          order: state.lists.filter((list) => !list.pinned).length,
          createdAt: new Date().toISOString(),
        },
      ]),
      activeListId: id,
    }));
    return id;
  },

  renameList: (id, name) =>
    set((state) => ({
      lists: state.lists.map((list) => list.id === id ? { ...list, name } : list),
    })),

  deleteList: (id, fallbackName) =>
    set((state) => {
      let lists = state.lists.filter((list) => list.id !== id);
      if (lists.length === 0) lists = [createList(fallbackName)];
      lists = normalizeLists(lists);
      return {
        lists,
        todos: state.todos.filter((todo) => todo.listId !== id),
        activeListId: state.activeListId === id
          ? lists[0].id
          : state.activeListId,
      };
    }),

  toggleListPinned: (id) =>
    set((state) => {
      const current = state.lists.find((list) => list.id === id);
      if (!current) return state;
      const nextPinned = !current.pinned;
      const nextOrder = Math.max(
        -1,
        ...state.lists
          .filter((list) => list.pinned === nextPinned && list.id !== id)
          .map((list) => list.order),
      ) + 1;
      return {
        lists: normalizeLists(state.lists.map((list) =>
          list.id === id ? { ...list, pinned: nextPinned, order: nextOrder } : list
        )),
      };
    }),

  reorderLists: (listId, targetListId, position = "before") =>
    set((state) => {
      const moved = state.lists.find((list) => list.id === listId);
      const target = state.lists.find((list) => list.id === targetListId);
      if (!moved || !target || moved.id === target.id || moved.pinned || target.pinned) return state;

       const group = sortLists(state.lists.filter((list) => list.pinned === moved.pinned));
       const fromIndex = group.findIndex((list) => list.id === listId);
       if (fromIndex < 0) return state;
       const [reordered] = group.splice(fromIndex, 1);
       const targetIndex = group.findIndex((list) => list.id === targetListId);
       if (targetIndex < 0) return state;
       group.splice(targetIndex + (position === "after" ? 1 : 0), 0, reordered);
      const orderById = new Map(group.map((list, index) => [list.id, index]));
      return {
        lists: normalizeLists(state.lists.map((list) =>
          orderById.has(list.id) ? { ...list, order: orderById.get(list.id)! } : list
        )),
      };
    }),

  setActiveList: (activeListId) => set((state) =>
    state.lists.some((list) => list.id === activeListId) ? { activeListId } : state
  ),

  setFilter: (filter) => set({ filter }),

  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),

  loadTodoData: (todos, listData, defaultListName) =>
    set(() => {
      const lists = normalizeLists(listData?.lists?.length ? listData.lists : [createList(defaultListName)]);
      const validListIds = new Set(lists.map((list) => list.id));
      const activeListId = listData?.activeListId && validListIds.has(listData.activeListId)
        ? listData.activeListId
        : lists[0].id;
      const normalizedTodos = normalizeTodoOrders(
        normalizeTodos(todos, activeListId).map((todo) =>
          validListIds.has(todo.listId) ? todo : { ...todo, listId: activeListId }
        ),
      );
      return { lists, activeListId, todos: sortTodos(normalizedTodos) };
    }),
}));
