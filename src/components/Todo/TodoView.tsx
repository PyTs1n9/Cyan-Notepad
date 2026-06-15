import React, { useState } from "react";
import { Plus, Trash2, Circle, CheckCircle2, GripVertical } from "lucide-react";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";

const priorityColors = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

const TodoView: React.FC = () => {
  const { todos, filter, addTodo, toggleTodo, deleteTodo, setFilter } = useTodoStore();
  const lang = useSettingsStore((s) => s.lang);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");

  const filteredTodos = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTodo(newTitle.trim(), newPriority);
    setNewTitle("");
    setNewPriority("medium");
  };

  const completedCount = todos.filter((t) => t.completed).length;

  const priorityLabelKeys = {
    low: "low" as const,
    medium: "medium" as const,
    high: "high" as const,
  };

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
      <div className="px-8 pb-3 flex gap-2">
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
      </div>

      {/* Todo List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="space-y-1">
          {filteredTodos.map((todo) => (
            <div
              key={todo.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg group transition-colors
                ${todo.completed ? "bg-bg-secondary opacity-60" : "bg-bg-primary hover:bg-bg-secondary"}
                border border-transparent hover:border-border`}
            >
              <GripVertical size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
              <button onClick={() => toggleTodo(todo.id)} className="cursor-pointer flex-shrink-0">
                {todo.completed ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <Circle size={18} className="text-text-muted hover:text-accent transition-colors" />
                )}
              </button>
              <span
                className={`flex-1 text-sm ${todo.completed ? "line-through text-text-muted" : "text-text-primary"}`}
              >
                {todo.title}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${priorityColors[todo.priority]}`}>
                {t(lang, priorityLabelKeys[todo.priority])}
              </span>
              <button
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
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
