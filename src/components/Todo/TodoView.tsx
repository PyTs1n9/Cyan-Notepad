import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Circle, CheckCircle2, GripVertical } from "lucide-react";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";

type Priority = "low" | "medium" | "high";

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

const TodoView: React.FC = () => {
  const { todos, filter, priorityFilter, addTodo, toggleTodo, deleteTodo, updateTodo, setFilter, setPriorityFilter, reorderTodos } = useTodoStore();
  const lang = useSettingsStore((s) => s.lang);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("low");

  // 内联编辑标题状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // 拖拽排序状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRealIndexRef = useRef<number>(-1);
  const dragOverRealIndexRef = useRef<number>(-1);

  const handleDragStart = (e: React.MouseEvent, filteredIndex: number) => {
    e.preventDefault();
    const realIdx = todos.findIndex((t) => t.id === filteredTodos[filteredIndex].id);
    setDragIndex(filteredIndex);
    dragRealIndexRef.current = realIdx;

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
      const children = Array.from(listRef.current.children) as HTMLElement[];
      let found = false;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (ev.clientY < mid) {
          setDragOverIndex(i);
          dragOverRealIndexRef.current = todos.findIndex((t) => t.id === filteredTodos[i]?.id);
          found = true;
          break;
        }
      }
      if (!found) {
        const last = children.length - 1;
        setDragOverIndex(last);
        dragOverRealIndexRef.current = todos.findIndex((t) => t.id === filteredTodos[last]?.id);
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      clone.remove();
      dragNodeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      const fromReal = dragRealIndexRef.current;
      const toReal = dragOverRealIndexRef.current;
      if (fromReal >= 0 && toReal >= 0 && fromReal !== toReal) {
        reorderTodos(fromReal, toReal);
      }
      setDragIndex(null);
      setDragOverIndex(null);
      dragRealIndexRef.current = -1;
      dragOverRealIndexRef.current = -1;
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

  const filteredTodos = todos.filter((t) => {
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

  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-text-primary">{t(lang, "todoTitle")}</h1>
        <p className="text-sm text-text-muted mt-1">
          {tWithParams(lang, "totalStats", { total: todos.length, done: completedCount })}
        </p>
      </div>

      {/* Add Todo */}
      <div className="px-8 pb-4">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t(lang, "addTaskPlaceholder")}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-bg-primary text-sm
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-text-primary
              placeholder:text-text-muted"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high")}
            className="px-3 py-2.5 rounded-lg border border-border text-sm bg-bg-primary text-text-secondary
              focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="low">{t(lang, "lowPriority")}</option>
            <option value="medium">{t(lang, "mediumPriority")}</option>
            <option value="high">{t(lang, "highPriority")}</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium
              hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus size={14} />
            <span>{t(lang, "add")}</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-8 pb-3 flex items-center gap-2 pr-10">
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs cursor-pointer transition-colors
              ${filter === f ? "bg-accent text-white" : "bg-bg-secondary text-text-secondary hover:bg-bg-hover"}`}
          >
            {f === "all" ? t(lang, "filterAll") : f === "active" ? t(lang, "filterActive") : t(lang, "filterCompleted")}
          </button>
        ))}
        {/* Priority Filter Dropdown */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as "all" | "low" | "medium" | "high")}
          className="ml-auto px-3 py-1 rounded-full border border-border text-xs bg-bg-primary text-text-secondary
            focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value="all">{t(lang, "filterAll")}</option>
          <option value="low">{t(lang, "low")}</option>
          <option value="medium">{t(lang, "medium")}</option>
          <option value="high">{t(lang, "high")}</option>
        </select>
      </div>

      {/* Todo List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="space-y-1" ref={listRef}>
          {filteredTodos.map((todo, index) => {
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index && dragIndex !== index;
            return (
            <div
              key={todo.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg group transition-colors
                ${todo.completed ? "bg-bg-secondary opacity-60" : "bg-bg-primary hover:bg-bg-secondary"}
                border border-transparent hover:border-border
                ${isDragging ? "opacity-30" : ""}
                ${isDragOver ? "border-t-2 border-t-accent" : ""}`}
            >
              <GripVertical
                size={14}
                className="text-text-muted opacity-30 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing select-none flex-shrink-0"
                onMouseDown={(e) => handleDragStart(e, index)}
              />
              <button onClick={() => toggleTodo(todo.id)} className="cursor-pointer flex-shrink-0">
                {todo.completed ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <Circle size={18} className="text-text-muted hover:text-accent transition-colors" />
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

              {/* 点击优先级标签直接循环切换 */}
              <button
                onClick={() => cyclePriority(todo.id, todo.priority)}
                className={`px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors hover:opacity-80
                  ${priorityColors[todo.priority]}`}
              >
                {t(lang, todo.priority === "low" ? "low" : todo.priority === "medium" ? "medium" : "high")}
              </button>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
            );
          })}
        </div>
        {filteredTodos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
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
  );
};

export default TodoView;
