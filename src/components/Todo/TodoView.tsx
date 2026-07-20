import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Circle, CheckCircle2, GripVertical, CalendarDays, X, ChevronLeft, ChevronRight, ChevronDown, Pin, PinOff, ListChecks } from "lucide-react";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { PORTAL_ACTION_EVENT, type PortalAction } from "@/utils/portalActions";
import type { Todo } from "@/types";

type Priority = "low" | "medium" | "high";
type CalendarView = "day" | "month" | "year";
type CalendarMotion = "next" | "prev" | "zoomIn" | "zoomOut";

const priorityColors: Record<Priority, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

const priorityCycle: Record<Priority, Priority> = {
  low: "medium",
  medium: "high",
  high: "low",
};

const formatDateInputValue = (value: string, lang: "zh" | "en") => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(year, month - 1, day);
  const isCurrentYear = year === new Date().getFullYear();

  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    month: "numeric",
    day: "numeric",
    ...(isCurrentYear ? {} : { year: "numeric" }),
  }).format(date);
};

const getTodayInputValue = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const getMonthStart = (value?: string) => {
  const selectedDate = parseDateInputValue(value) ?? new Date();
  return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
};

const addMonths = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

const getCalendarDays = (monthDate: Date) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      value: toDateInputValue(date),
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    };
  });
};

const getYearRange = (date: Date) => {
  const startYear = Math.floor(date.getFullYear() / 12) * 12;
  return Array.from({ length: 12 }, (_, index) => startYear + index);
};

const TodoView: React.FC = () => {
  const { todos, lists, activeListId, filter, priorityFilter, addTodo, toggleTodo, deleteTodo, updateTodo, togglePinned, setFilter, setPriorityFilter, reorderTodos } = useTodoStore();
  const lang = useSettingsStore((s) => s.lang);
  const activeList = lists.find((list) => list.id === activeListId);
  const listTodos = todos.filter((todo) => todo.listId === activeListId);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("low");
  const newTodoInputRef = useRef<HTMLInputElement>(null);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const [priorityFilterDropdownOpen, setPriorityFilterDropdownOpen] = useState(false);
  const priorityFilterDropdownRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmTodo, setDeleteConfirmTodo] = useState<Todo | null>(null);

  // 内联编辑标题状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [openCalendarTodoId, setOpenCalendarTodoId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart());
  const [calendarView, setCalendarView] = useState<CalendarView>("day");
  const [calendarMotion, setCalendarMotion] = useState<CalendarMotion>("zoomIn");
  const [calendarPosition, setCalendarPosition] = useState({ top: 0, left: 0 });
  const calendarRef = useRef<HTMLDivElement>(null);

  // 拖拽排序状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragTodoIdRef = useRef<string | null>(null);
  const dragOverTodoIdRef = useRef<string | null>(null);
  const dragOverPositionRef = useRef<"before" | "after">("before");

  useEffect(() => {
    const handlePortalAction = (event: Event) => {
      if ((event as CustomEvent<PortalAction>).detail !== "new-todo") return;
      newTodoInputRef.current?.focus();
    };
    window.addEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
    return () => window.removeEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
  }, []);

  const confirmDeleteTodo = () => {
    if (!deleteConfirmTodo) return;
    const latestTodo = todos.find((todo) => todo.id === deleteConfirmTodo.id);
    if (latestTodo?.pinned) {
      setDeleteConfirmTodo(null);
      return;
    }

    deleteTodo(deleteConfirmTodo.id);
    setDeleteConfirmTodo(null);
  };

  const handleDragStart = (e: React.MouseEvent, filteredIndex: number) => {
    e.preventDefault();
    const draggedTodo = filteredTodos[filteredIndex];
    if (!draggedTodo || draggedTodo.pinned) return;

    setDragIndex(filteredIndex);
    dragTodoIdRef.current = draggedTodo.id;
    dragOverPositionRef.current = "before";

    const itemEls = listRef.current?.children;
    if (!itemEls || !itemEls[filteredIndex]) return;
    const startRect = (itemEls[filteredIndex] as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - startRect.top;

    // 创建浮动克隆
    const clone = (itemEls[filteredIndex] as HTMLElement).cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.85";
    clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
    clone.style.borderRadius = "8px";
    clone.style.transition = "none";
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    document.body.appendChild(clone);
    dragNodeRef.current = clone;

    const onMove = (ev: MouseEvent) => {
      clone.style.top = `${ev.clientY - offsetY}px`;

      // 计算当前 hover 到哪个 item
      if (!listRef.current) return;
      const viewport = listRef.current.getBoundingClientRect();
      if (ev.clientX < viewport.left || ev.clientX > viewport.right) {
        dragOverTodoIdRef.current = null;
        setDragOverIndex(null);
        setDragOverPosition(null);
        return;
      }
      const children = Array.from(listRef.current.children) as HTMLElement[];
      let found = false;
      for (let i = 0; i < children.length; i++) {
        if (filteredTodos[i]?.pinned || filteredTodos[i]?.id === draggedTodo.id) continue;
        const rect = children[i].getBoundingClientRect();
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          setDragOverIndex(i);
          dragOverTodoIdRef.current = filteredTodos[i]?.id ?? null;
          dragOverPositionRef.current = ev.clientY >= rect.top + rect.height / 2 ? "after" : "before";
          setDragOverPosition(dragOverPositionRef.current);
          found = true;
          break;
        }
      }
      if (found) return;
      for (let i = 0; i < children.length; i++) {
        if (filteredTodos[i]?.pinned) continue;
        if (filteredTodos[i]?.id === draggedTodo.id) continue;
        const rect = children[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (ev.clientY < mid) {
          setDragOverIndex(i);
          dragOverTodoIdRef.current = filteredTodos[i]?.id ?? null;
          dragOverPositionRef.current = "before";
          setDragOverPosition("before");
          found = true;
          break;
        }
      }
      if (!found) {
        let last = -1;
        for (let index = filteredTodos.length - 1; index >= 0; index -= 1) {
          if (!filteredTodos[index].pinned && filteredTodos[index].id !== draggedTodo.id) {
            last = index;
            break;
          }
        }
        if (last < 0) return;
        setDragOverIndex(last);
        dragOverTodoIdRef.current = filteredTodos[last]?.id ?? null;
        dragOverPositionRef.current = "after";
        setDragOverPosition("after");
      }
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      clone.remove();
      dragNodeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      const todoId = dragTodoIdRef.current;
      const targetTodoId = dragOverTodoIdRef.current;
      const viewport = listRef.current?.getBoundingClientRect();
      const insideViewport = !viewport || (upEvent.clientX >= viewport.left && upEvent.clientX <= viewport.right);
      if (insideViewport && todoId && targetTodoId && todoId !== targetTodoId) {
        reorderTodos(todoId, targetTodoId, dragOverPositionRef.current);
      }
      setDragIndex(null);
      setDragOverIndex(null);
      setDragOverPosition(null);
      dragTodoIdRef.current = null;
      dragOverTodoIdRef.current = null;
      dragOverPositionRef.current = "before";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    setNewTitle("");
    setEditingId(null);
    setEditingTitle("");
    setOpenCalendarTodoId(null);
    setDeleteConfirmTodo(null);
  }, [activeListId]);

  useEffect(() => {
    if (!priorityDropdownOpen) return;

    const closeDropdown = (event: MouseEvent) => {
      if (priorityDropdownRef.current?.contains(event.target as Node)) return;
      setPriorityDropdownOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPriorityDropdownOpen(false);
    };

    document.addEventListener("mousedown", closeDropdown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDropdown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [priorityDropdownOpen]);

  useEffect(() => {
    if (!priorityFilterDropdownOpen) return;

    const closeDropdown = (event: MouseEvent) => {
      if (priorityFilterDropdownRef.current?.contains(event.target as Node)) return;
      setPriorityFilterDropdownOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPriorityFilterDropdownOpen(false);
    };

    document.addEventListener("mousedown", closeDropdown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDropdown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [priorityFilterDropdownOpen]);

  useEffect(() => {
    if (!openCalendarTodoId) return;

    const closeCalendar = (event: MouseEvent) => {
      if (calendarRef.current?.contains(event.target as Node)) return;
      setOpenCalendarTodoId(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCalendarTodoId(null);
    };

    document.addEventListener("mousedown", closeCalendar);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeCalendar);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openCalendarTodoId]);

  const startEditing = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const confirmEdit = () => {
    if (editingId && editingTitle.trim()) {
      updateTodo(editingId, { title: editingTitle.trim() });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  // 点击优先级标签直接循环切换：低→中→高→低
  const cyclePriority = (id: string, current: Priority) => {
    updateTodo(id, { priority: priorityCycle[current] });
  };

  const toggleCalendar = (todoId: string, dueDate: string | undefined, element: HTMLElement) => {
    if (openCalendarTodoId === todoId) {
      setOpenCalendarTodoId(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const calendarWidth = 248;
    const margin = 12;
    setCalendarPosition({
      top: rect.bottom + 8,
      left: Math.min(Math.max(rect.left, margin), window.innerWidth - calendarWidth - margin),
    });
    setCalendarMonth(getMonthStart(dueDate));
    setCalendarView("day");
    setCalendarMotion("zoomIn");
    setOpenCalendarTodoId(todoId);
  };

  const moveCalendar = (motion: "next" | "prev") => {
    setCalendarMotion(motion);
    setCalendarMonth((current) => {
      if (calendarView === "day") return addMonths(current, motion === "next" ? 1 : -1);
      if (calendarView === "month") {
        return new Date(current.getFullYear() + (motion === "next" ? 1 : -1), current.getMonth(), 1);
      }
      return new Date(current.getFullYear() + (motion === "next" ? 12 : -12), current.getMonth(), 1);
    });
  };

  const showCalendarView = (view: CalendarView, motion: CalendarMotion) => {
    setCalendarMotion(motion);
    setCalendarView(view);
  };

  const filteredTodos = listTodos.filter((t) => {
    if (filter === "active" && t.completed) return false;
    if (filter === "completed" && !t.completed) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    return true;
  });

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTodo(newTitle.trim(), newPriority);
    setNewTitle("");
    setNewPriority("low");
  };

  const completedCount = listTodos.filter((t) => t.completed).length;
  const completionRate = listTodos.length === 0 ? 0 : Math.round((completedCount / listTodos.length) * 100);
  const todayInputValue = getTodayInputValue();
  const priorityOptions: { value: Priority; label: string }[] = [
    { value: "low", label: t(lang, "lowPriority") },
    { value: "medium", label: t(lang, "mediumPriority") },
    { value: "high", label: t(lang, "highPriority") },
  ];
  const selectedPriorityLabel = priorityOptions.find((option) => option.value === newPriority)?.label;
  const priorityFilterOptions: { value: typeof priorityFilter; label: string }[] = [
    { value: "all", label: t(lang, "filterAll") },
    { value: "low", label: t(lang, "low") },
    { value: "medium", label: t(lang, "medium") },
    { value: "high", label: t(lang, "high") },
  ];
  const selectedPriorityFilterLabel = priorityFilterOptions.find((option) => option.value === priorityFilter)?.label;

  return (
    <div className="todo-surface flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-4 pt-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent-light text-accent">
          <ListChecks size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-text-primary">{activeList?.name ?? t(lang, "todoTitle")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {tWithParams(lang, "totalStats", { total: listTodos.length, done: completedCount })}
          </p>
        </div>
        <div className="w-32 flex-shrink-0 rounded-xl border border-border bg-bg-primary/70 px-3 py-2 shadow-sm backdrop-blur-md">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-text-muted">
            <span>{completedCount}/{listTodos.length}</span>
            <span className="text-accent">{completionRate}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Add Todo */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-primary/75 p-2 focus-within:border-accent/45">
          <span className="ml-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
            <Plus size={16} strokeWidth={2.4} />
          </span>
          <input
            ref={newTodoInputRef}
            type="text"
            value={newTitle}
            disabled={!activeListId}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t(lang, "addTaskPlaceholder")}
            className="h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm text-text-primary
              placeholder:text-text-muted focus:outline-none"
          />
          <div className="relative flex-shrink-0" ref={priorityDropdownRef}>
            <button
              type="button"
              onClick={() => setPriorityDropdownOpen((open) => !open)}
              className="h-10 min-w-[112px] rounded-lg border border-border bg-bg-secondary/70 px-3 text-sm
                text-text-secondary cursor-pointer hover:border-accent/30 hover:bg-bg-hover
                focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 flex items-center justify-between gap-2"
            >
              <span className="truncate">{selectedPriorityLabel}</span>
              <ChevronDown
                size={14}
                className={`flex-shrink-0 text-text-muted transition-transform ${priorityDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {priorityDropdownOpen && (
              <div className="todo-popover absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border
                bg-bg-primary shadow-lg">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setNewPriority(option.value);
                      setPriorityDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer
                      ${newPriority === option.value
                        ? "bg-accent-light text-accent"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim() || !activeListId}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-white
              hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={14} />
            <span>{t(lang, "add")}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex items-center gap-1 rounded-full border border-border bg-bg-secondary/70 p-1">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs cursor-pointer
                ${filter === f ? "bg-accent text-white" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
            >
              {f === "all" ? t(lang, "filterAll") : f === "active" ? t(lang, "filterActive") : t(lang, "filterCompleted")}
            </button>
          ))}
        </div>
        {/* Priority Filter Dropdown */}
        <div className="relative ml-auto flex-shrink-0" ref={priorityFilterDropdownRef}>
          <button
            type="button"
            onClick={() => setPriorityFilterDropdownOpen((open) => !open)}
            className="min-w-[86px] rounded-full border border-border bg-bg-primary px-3 py-1 text-xs
              text-text-secondary transition-colors cursor-pointer hover:bg-bg-secondary
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent flex items-center justify-between gap-1.5"
          >
            <span className="truncate">{selectedPriorityFilterLabel}</span>
            <ChevronDown
              size={12}
              className={`flex-shrink-0 text-text-muted transition-transform ${priorityFilterDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>

          {priorityFilterDropdownOpen && (
            <div className="todo-popover absolute right-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-xl border border-border
              bg-bg-primary shadow-lg">
              {priorityFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPriorityFilter(option.value);
                    setPriorityFilterDropdownOpen(false);
                  }}
                  className={`w-full whitespace-nowrap px-3 py-2 text-left text-xs transition-colors cursor-pointer
                    ${priorityFilter === option.value
                      ? "bg-accent-light text-accent"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Todo List */}
      <div className="app-work-area-overlay mx-4 mb-3 flex-1 min-h-0 overflow-hidden rounded-2xl border border-border bg-bg-primary/65">
        <div className="h-full overflow-y-auto px-4 py-4">
        <div className="space-y-1" ref={listRef}>
          {filteredTodos.map((todo, index) => {
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && dragIndex !== index;
            const isOverdue = Boolean(todo.dueDate && todo.dueDate < todayInputValue && !todo.completed);
            const selectedDueDate = parseDateInputValue(todo.dueDate);
            return (
            <div
              key={todo.id}
              className={`todo-task-row group relative flex items-center gap-3 rounded-xl border px-4 py-3
                ${todo.completed ? "border-transparent bg-bg-secondary/75 opacity-65" : "border-transparent bg-bg-primary/75 hover:border-border hover:bg-bg-primary"}
                ${isDragging ? "opacity-30" : ""}
                ${isDragOver ? "bg-accent-light/35" : ""}`}
            >
              {isDragOver && dragOverPosition && (
                <span
                  aria-hidden="true"
                  className={`drag-insertion-line drag-insertion-line--${dragOverPosition}`}
                />
              )}
              {!todo.pinned && (
                <GripVertical
                  size={14}
                  className="flex-shrink-0 cursor-grab select-none text-text-muted opacity-30 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                  onMouseDown={(e) => handleDragStart(e, index)}
                />
              )}
              {todo.pinned && <Pin size={14} className="flex-shrink-0 text-accent" />}
              <button
                onClick={() => toggleTodo(todo.id)}
                className={`flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-accent-light ${todo.completed ? "todo-check-done" : ""}`}
              >
                {todo.completed ? (
                  <CheckCircle2 size={19} className="text-success" />
                ) : (
                  <Circle size={19} className="text-text-muted hover:text-accent transition-colors" />
                )}
              </button>

              {/* 内联编辑标题：点击原地变输入框 */}
              {editingId === todo.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  onBlur={confirmEdit}
                  className="flex-1 text-sm px-1 py-0.5 rounded border border-accent bg-bg-primary
                    text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              ) : (
                <span
                  onClick={() => startEditing(todo.id, todo.title)}
                  className={`flex-1 text-sm cursor-text px-1 py-0.5 rounded hover:bg-bg-hover transition-colors
                    ${todo.completed ? "line-through text-text-muted" : "text-text-primary"}`}
                  title={todo.title}
                >
                  {todo.title}
                </span>
              )}

              <button
                type="button"
                onClick={() => togglePinned(todo.id)}
                className={`h-6 w-6 rounded-full flex items-center justify-center transition-all cursor-pointer
                  ${todo.pinned
                    ? "text-accent bg-accent-light"
                    : "text-text-muted opacity-0 group-hover:opacity-100 hover:bg-bg-hover hover:text-accent"}`}
                title={todo.pinned ? t(lang, "unpinTodo") : t(lang, "pinTodo")}
                aria-label={todo.pinned ? t(lang, "unpinTodo") : t(lang, "pinTodo")}
              >
                {todo.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => toggleCalendar(todo.id, todo.dueDate, e.currentTarget)}
                  className={`h-6 min-w-[74px] px-2 rounded-full border text-xs flex items-center justify-center gap-1
                    cursor-pointer transition-colors
                    ${todo.dueDate
                      ? isOverdue
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-hover"
                      : "border-border bg-bg-primary text-text-muted hover:bg-bg-secondary"}`}
                  title={todo.dueDate ? t(lang, "dueDate") : t(lang, "noDueDate")}
                  aria-expanded={openCalendarTodoId === todo.id}
                  aria-label={t(lang, "dueDate")}
                >
                  <CalendarDays size={12} className="flex-shrink-0" />
                  <span className="leading-none">
                    {todo.dueDate ? formatDateInputValue(todo.dueDate, lang) : t(lang, "noDueDate")}
                  </span>
                </button>
                {openCalendarTodoId === todo.id && (
                  <div
                    ref={calendarRef}
                    className="todo-popover fixed z-50 w-[248px] rounded-xl border border-border bg-bg-primary p-3
                      text-text-primary shadow-lg shadow-black/10"
                    style={{ top: calendarPosition.top, left: calendarPosition.left }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <button
                        type="button"
                        onClick={() => moveCalendar("prev")}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted
                          hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (calendarView === "day") showCalendarView("month", "zoomOut");
                          if (calendarView === "month") showCalendarView("year", "zoomOut");
                        }}
                        className="min-w-28 rounded-md px-2 py-1 text-sm font-medium text-text-primary
                          transition-colors hover:bg-bg-hover cursor-pointer"
                      >
                        {calendarView === "day"
                          ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
                              year: "numeric",
                              month: "long",
                            }).format(calendarMonth)
                          : calendarView === "month"
                            ? calendarMonth.getFullYear()
                            : `${getYearRange(calendarMonth)[0]} - ${getYearRange(calendarMonth)[11]}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCalendar("next")}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted
                          hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    <div
                      key={`${calendarView}-${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}`}
                      className={`calendar-motion calendar-motion-${calendarMotion}`}
                    >
                    {calendarView === "day" && (
                      <>
                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {(lang === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]).map((day, dayIndex) => (
                            <div key={`${day}-${dayIndex}`} className="h-6 flex items-center justify-center text-[11px] text-text-muted">
                              {day}
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {getCalendarDays(calendarMonth).map((day) => {
                            const isSelected = day.value === todo.dueDate;
                            const isToday = day.value === todayInputValue;
                            return (
                              <button
                                type="button"
                                key={day.value}
                                onClick={() => {
                                  updateTodo(todo.id, { dueDate: day.value });
                                  setOpenCalendarTodoId(null);
                                }}
                                className={`h-7 rounded-md text-xs transition-colors cursor-pointer
                                  ${isSelected
                                    ? "bg-accent text-white"
                                    : isToday
                                      ? "bg-accent-light text-accent"
                                      : day.isCurrentMonth
                                        ? "text-text-primary hover:bg-bg-hover"
                                        : "text-text-muted/45 hover:bg-bg-hover"}`}
                              >
                                {day.date.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {calendarView === "month" && (
                      <div className="grid grid-cols-3 gap-2">
                        {Array.from({ length: 12 }, (_, monthIndex) => {
                          const isSelectedMonth = selectedDueDate?.getFullYear() === calendarMonth.getFullYear()
                            && selectedDueDate?.getMonth() === monthIndex;
                          const isCurrentMonth = new Date().getFullYear() === calendarMonth.getFullYear()
                            && new Date().getMonth() === monthIndex;

                          return (
                            <button
                              type="button"
                              key={monthIndex}
                              onClick={() => {
                                setCalendarMonth(new Date(calendarMonth.getFullYear(), monthIndex, 1));
                                showCalendarView("day", "zoomIn");
                              }}
                              className={`h-9 rounded-md text-xs transition-colors cursor-pointer
                                ${isSelectedMonth
                                  ? "bg-accent text-white"
                                  : isCurrentMonth
                                    ? "bg-accent-light text-accent"
                                    : "text-text-primary hover:bg-bg-hover"}`}
                            >
                              {new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short" }).format(new Date(calendarMonth.getFullYear(), monthIndex, 1))}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {calendarView === "year" && (
                      <div className="grid grid-cols-3 gap-2">
                        {getYearRange(calendarMonth).map((year) => {
                          const isSelectedYear = selectedDueDate?.getFullYear() === year;
                          const isCurrentYear = new Date().getFullYear() === year;

                          return (
                            <button
                              type="button"
                              key={year}
                              onClick={() => {
                                setCalendarMonth(new Date(year, calendarMonth.getMonth(), 1));
                                showCalendarView("month", "zoomIn");
                              }}
                              className={`h-9 rounded-md text-xs transition-colors cursor-pointer
                                ${isSelectedYear
                                  ? "bg-accent text-white"
                                  : isCurrentYear
                                    ? "bg-accent-light text-accent"
                                    : "text-text-primary hover:bg-bg-hover"}`}
                            >
                              {year}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>
                )}
                {todo.dueDate && (
                  <button
                    onClick={() => {
                      updateTodo(todo.id, { dueDate: undefined });
                      if (openCalendarTodoId === todo.id) setOpenCalendarTodoId(null);
                    }}
                    className="h-6 w-6 rounded-full flex items-center justify-center text-text-muted
                      hover:bg-bg-hover hover:text-danger transition-colors cursor-pointer"
                    title={t(lang, "clearDueDate")}
                    aria-label={t(lang, "clearDueDate")}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* 点击优先级标签直接循环切换 */}
              <button
                onClick={() => cyclePriority(todo.id, todo.priority)}
                className={`px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors hover:opacity-80
                  ${priorityColors[todo.priority]}`}
              >
                {t(lang, todo.priority === "low" ? "low" : todo.priority === "medium" ? "medium" : "high")}
              </button>

              <button
                onClick={() => {
                  if (todo.pinned) return;
                  setDeleteConfirmTodo(todo);
                }}
                disabled={todo.pinned}
                className={`opacity-0 group-hover:opacity-100 transition-all
                  ${todo.pinned
                    ? "text-text-muted/35 cursor-not-allowed"
                    : "text-text-muted hover:text-danger cursor-pointer"}`}
                title={t(lang, "deleteTodo")}
                aria-disabled={todo.pinned}
              >
                <Trash2 size={14} />
              </button>
            </div>
            );
          })}
        </div>
        {filteredTodos.length === 0 && (
          <div className="flex min-h-full flex-col items-center justify-center py-16 text-text-muted">
            <CheckCircle2 size={48} className="mb-3 opacity-30" />
            <p className="text-sm">
              {filter === "completed"
                ? t(lang, "noCompleted")
                : filter === "active"
                  ? t(lang, "allDone")
                  : t(lang, "noTodos")}
            </p>
          </div>
        )}
        </div>
      </div>

      {deleteConfirmTodo && (
        <div
          className="todo-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center px-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))" }}
        >
          <div
            className="todo-modal-panel w-full max-w-[320px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger flex-shrink-0">
                  <Trash2 size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t(lang, "deleteTodo")}</div>
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {deleteConfirmTodo.title}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                {t(lang, "confirmDeleteTodoMessage").replace("{todo}", deleteConfirmTodo.title)}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setDeleteConfirmTodo(null)}
                className="h-8 px-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmDeleteTodo}
                className="h-8 px-3 rounded-lg bg-danger text-white text-sm hover:bg-danger/90 transition-colors cursor-pointer"
              >
                {t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoView;
