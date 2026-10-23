import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, Trash2, Circle, Check, CheckCircle2, GripVertical, CalendarDays, X, ChevronLeft, ChevronRight, Pin, PinOff, ListPlus } from "lucide-react";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { PORTAL_ACTION_EVENT, type PortalAction } from "@/utils/portalActions";
import { subscribeTodoIntent, type TodoIntent } from "@/utils/todoIntent";
import TodoStrip from "@/components/Todo/TodoStrip";
import TodoDescriptionCard from "@/components/Todo/TodoDescriptionCard";
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
  const { todos, activeListId, filter, priorityFilter, addSubtask, toggleExpanded, toggleTodo, deleteTodo, updateTodo, togglePinned, setFilter, setPriorityFilter, reorderTodos } = useTodoStore();
  const lang = useSettingsStore((s) => s.lang);
  const listTodos = todos.filter((todo) => todo.listId === activeListId);
  const topLevelTodos = listTodos.filter((todo) => !todo.parentId);
  const subtasksByParent = new Map<string, Todo[]>();
  listTodos.forEach((todo) => {
    if (!todo.parentId) return;
    const siblings = subtasksByParent.get(todo.parentId);
    if (siblings) siblings.push(todo);
    else subtasksByParent.set(todo.parentId, [todo]);
  });
  const [deleteConfirmTodo, setDeleteConfirmTodo] = useState<Todo | null>(null);
  /** Task whose description is open in the editor; one at a time. */
  const [descriptionEditorId, setDescriptionEditorId] = useState<string | null>(null);
  /** Requests raised in the sidebar; consumed below, never handled on arrival. */
  const [todoIntent, setTodoIntent] = useState<TodoIntent | null>(null);

  useEffect(() => subscribeTodoIntent(setTodoIntent), []);

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
  const calendarAnchorRef = useRef<HTMLElement | null>(null);

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
      const action = (event as CustomEvent<PortalAction>).detail;
      if (action === "filter-todos-all") {
        setFilter("all");
        setPriorityFilter("all");
      } else if (action === "filter-todos-active") {
        setFilter("active");
      } else if (action === "filter-todos-completed") {
        setFilter("completed");
      }
    };
    window.addEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
    return () => window.removeEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
  }, [setFilter, setPriorityFilter]);

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

    const itemEls = listRef.current?.querySelectorAll<HTMLElement>("[data-todo-row-id]");
    if (!itemEls || !itemEls[filteredIndex]) return;
    const startRect = itemEls[filteredIndex].getBoundingClientRect();
    const offsetY = e.clientY - startRect.top;

    // 创建浮动克隆
    const clone = itemEls[filteredIndex].cloneNode(true) as HTMLElement;
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
      const children = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-todo-row-id]"));
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
    setEditingId(null);
    setEditingTitle("");
    setOpenCalendarTodoId(null);
    setDeleteConfirmTodo(null);
    setDescriptionEditorId(null);
  }, [activeListId]);

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

  const positionCalendar = useCallback((calendarHeight = 284) => {
    const anchor = calendarAnchorRef.current;
    if (!anchor?.isConnected) return;

    const rect = anchor.getBoundingClientRect();
    const calendarWidth = 248;
    const margin = 12;
    const gap = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin - gap;
    const spaceAbove = rect.top - margin - gap;
    const openAbove = spaceBelow < calendarHeight && spaceAbove > spaceBelow;
    const preferredTop = openAbove
      ? rect.top - gap - calendarHeight
      : rect.bottom + gap;
    const maxTop = Math.max(margin, window.innerHeight - calendarHeight - margin);
    const top = Math.min(Math.max(preferredTop, margin), maxTop);
    const maxLeft = Math.max(margin, window.innerWidth - calendarWidth - margin);
    const left = Math.min(Math.max(rect.left, margin), maxLeft);

    setCalendarPosition((current) => (
      current.top === top && current.left === left ? current : { top, left }
    ));
  }, []);

  useLayoutEffect(() => {
    if (!openCalendarTodoId) return;
    const calendar = calendarRef.current;
    if (!calendar) return;

    const updatePosition = () => positionCalendar(calendar.getBoundingClientRect().height);
    updatePosition();

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(calendar);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [calendarView, openCalendarTodoId, positionCalendar]);

  const startEditing = (id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const confirmEdit = () => {
    const targetId = editingId;
    if (!targetId) return;

    const current = todos.find((todo) => todo.id === targetId);
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      // 新建的空子待办未填写内容时直接丢弃，避免留下空行
      if (current?.parentId) deleteTodo(targetId);
    } else if (nextTitle !== current?.title) {
      updateTodo(targetId, { title: nextTitle });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const cancelEdit = () => {
    const targetId = editingId;
    const current = targetId ? todos.find((todo) => todo.id === targetId) : undefined;
    if (targetId && current?.parentId && !current.title) deleteTodo(targetId);
    setEditingId(null);
    setEditingTitle("");
  };

  // 新建子待办：立即落库并进入内联编辑，未填内容则在失焦时自动丢弃
  const handleAddSubtask = (parentId: string) => {
    const parent = todos.find((todo) => todo.id === parentId);
    if (!parent) return;
    if (!parent.expanded) toggleExpanded(parentId);
    const subtaskId = addSubtask(parentId, "");
    setEditingId(subtaskId);
    setEditingTitle("");
  };

  // Runs in the same commit as the list switch the sidebar triggered, and after
  // the reset effect above — handling it on arrival would be undone by that reset.
  useEffect(() => {
    if (!todoIntent) return;
    setTodoIntent(null);
    const target = todos.find((todo) => todo.id === todoIntent.todoId);
    if (!target) return;
    if (todoIntent.kind === "edit-description") {
      setDescriptionEditorId(target.id);
    } else if (todoIntent.kind === "add-subtask") {
      handleAddSubtask(target.id);
    } else if (!target.pinned) {
      // 置顶任务在 store 里拒绝删除，这里直接跳过，避免弹出点了也没用的确认框
      setDeleteConfirmTodo(target);
    }
    // `todos` is read from the render that produced the intent; re-running on
    // every todo change would only re-enter the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoIntent]);

  // 点击优先级标签直接循环切换：低→中→高→低
  const cyclePriority = (id: string, current: Priority) => {
    updateTodo(id, { priority: priorityCycle[current] });
  };

  const toggleCalendar = (todoId: string, dueDate: string | undefined, element: HTMLElement) => {
    if (openCalendarTodoId === todoId) {
      setOpenCalendarTodoId(null);
      calendarAnchorRef.current = null;
      return;
    }

    calendarAnchorRef.current = element;
    positionCalendar();
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

  // 筛选只作用于父待办；展开后子待办始终完整显示
  const filteredTodos = topLevelTodos.filter((t) => {
    if (filter === "active" && t.completed) return false;
    if (filter === "completed" && !t.completed) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    return true;
  });

  const todayInputValue = getTodayInputValue();

  return (
    <div className="todo-surface flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TodoStrip />

      {/* Todo List */}
      {/* Flush with the shell card — the rows carry their own chips, so a second
          frame here only added a border inside a border. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto px-2 pb-3 pt-1.5">
        <div className="space-y-0.5" ref={listRef}>
          {filteredTodos.map((todo, index) => {
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && dragIndex !== index;
            const isOverdue = Boolean(todo.dueDate && todo.dueDate < todayInputValue && !todo.completed);
            const selectedDueDate = parseDateInputValue(todo.dueDate);
            const subtasks = subtasksByParent.get(todo.id) ?? [];
            const hasSubtasks = subtasks.length > 0;
            const doneSubtasks = subtasks.filter((subtask) => subtask.completed).length;
            const isExpanded = hasSubtasks && Boolean(todo.expanded);
            return (
            <div key={todo.id} className="todo-task-group">
            <div
              data-todo-row-id={todo.id}
              className={`todo-task-row group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5
                ${todo.completed ? "opacity-60" : "hover:bg-bg-hover"}
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
              {/* 固定宽度的展开位，保证有无子待办时勾选框都对齐 */}
              <div className="flex w-4 flex-shrink-0 items-center justify-center">
                {hasSubtasks && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(todo.id)}
                    className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-text-muted
                      transition-colors hover:bg-bg-hover hover:text-text-primary"
                    title={isExpanded ? t(lang, "collapseSubtasks") : t(lang, "expandSubtasks")}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? t(lang, "collapseSubtasks") : t(lang, "expandSubtasks")}
                  >
                    <ChevronRight
                      size={13}
                      className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
              </div>
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

              {hasSubtasks && (
                <span
                  className="flex-shrink-0 rounded-full bg-bg-secondary px-1.5 py-0.5 text-[11px] leading-none
                    tabular-nums text-text-muted"
                  title={`${doneSubtasks}/${subtasks.length} ${t(lang, "subtask")}`}
                >
                  {doneSubtasks}/{subtasks.length}
                </span>
              )}

              <button
                type="button"
                onClick={() => setDescriptionEditorId(todo.id)}
                className={`h-6 w-6 rounded-full flex items-center justify-center transition-all cursor-pointer
                  ${Boolean(todo.description?.trim())
                    ? "text-accent hover:bg-accent-light"
                    : "text-text-muted opacity-0 group-hover:opacity-100 hover:bg-bg-hover hover:text-accent"}`}
                title={Boolean(todo.description?.trim()) ? t(lang, "editTodoDescription") : t(lang, "addTodoDescription")}
                aria-label={Boolean(todo.description?.trim()) ? t(lang, "editTodoDescription") : t(lang, "addTodoDescription")}
              >
                <AlignLeft size={12} />
              </button>

              <button
                type="button"
                onClick={() => handleAddSubtask(todo.id)}
                className="h-6 w-6 rounded-full flex items-center justify-center text-text-muted
                  opacity-0 group-hover:opacity-100 transition-all cursor-pointer
                  hover:bg-bg-hover hover:text-accent"
                title={t(lang, "addSubtask")}
                aria-label={t(lang, "addSubtask")}
              >
                <ListPlus size={12} />
              </button>

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
                {openCalendarTodoId === todo.id && createPortal(
                  <div
                    ref={calendarRef}
                    className="todo-popover fixed z-50 max-h-[calc(100vh-24px)] w-[248px] overflow-y-auto rounded-xl border border-border bg-bg-primary p-3
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
                  </div>,
                  document.body,
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

            {/* The body of the task, indented to the title column (px-2.5 10 +
                grip 14 + gap 10 + slot 16 + gap 10 + toggle 28 + gap 10 = 98) so
                it reads as this task's own text, not as a sibling row. */}
            <div className="ml-[98px] mr-2 pb-0.5">
              <TodoDescriptionCard
                description={todo.description}
                completed={todo.completed}
                editing={descriptionEditorId === todo.id}
                onEditingChange={(next) => setDescriptionEditorId(next ? todo.id : null)}
                onSave={(value) => updateTodo(todo.id, { description: value || undefined })}
              />
            </div>

            {isExpanded && (
              // The guide line sits at the parent circle's centre (px-2.5 + grip 14
              // + gap 10 + expand slot 16 + gap 10 + half of the 28px toggle = 74),
              // so the branch visually hangs off the box it belongs to.
              <div className="todo-subtask-list ml-[74px] mt-0.5 mb-1 space-y-0.5 border-l border-border/60 pl-3">
                {subtasks.map((subtask) => (
                  <div
                    key={subtask.id}
                    data-subtask-row-id={subtask.id}
                    className="group/sub flex items-center gap-2 rounded-lg py-1 pr-2 transition-colors hover:bg-bg-hover/60"
                  >
                    {/* Subtasks are a different rank of the same thing: the round
                        toggle belongs to the parent item, a square one to a child. */}
                    <button
                      type="button"
                      onClick={() => toggleTodo(subtask.id)}
                      className={`flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded
                        transition-colors hover:bg-accent-light ${subtask.completed ? "todo-check-done" : ""}`}
                      aria-label={t(lang, "subtask")}
                    >
                      <span
                        className={`flex h-3 w-3 items-center justify-center rounded-[3px] border transition-colors ${
                          subtask.completed
                            ? "border-success bg-success text-white"
                            : "border-text-muted/70 bg-transparent"
                        }`}
                      >
                        {subtask.completed && <Check size={9} strokeWidth={3.5} />}
                      </span>
                    </button>

                    {editingId === subtask.id ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingTitle}
                        placeholder={t(lang, "addSubtask")}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={confirmEdit}
                        className="flex-1 rounded border border-accent bg-bg-primary px-1 py-0.5 text-[13px]
                          text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    ) : (
                      <span
                        onClick={() => startEditing(subtask.id, subtask.title)}
                        className={`flex-1 cursor-text rounded px-1 py-0.5 text-[13px] transition-colors hover:bg-bg-hover
                          ${subtask.completed ? "text-text-muted line-through" : "text-text-secondary"}`}
                        title={subtask.title}
                      >
                        {subtask.title || t(lang, "subtask")}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteTodo(subtask.id)}
                      className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full text-text-muted
                        opacity-0 transition-all group-hover/sub:opacity-100 hover:bg-bg-hover hover:text-danger cursor-pointer"
                      title={t(lang, "deleteSubtask")}
                      aria-label={t(lang, "deleteSubtask")}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                {(subtasksByParent.get(deleteConfirmTodo.id)?.length ?? 0) > 0
                  ? tWithParams(lang, "confirmDeleteTodoWithSubtasks", {
                      todo: deleteConfirmTodo.title,
                      count: subtasksByParent.get(deleteConfirmTodo.id)?.length ?? 0,
                    })
                  : t(lang, "confirmDeleteTodoMessage").replace("{todo}", deleteConfirmTodo.title)}
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
