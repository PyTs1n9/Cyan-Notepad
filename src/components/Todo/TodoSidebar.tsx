import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  GripVertical,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTodoStore } from "@/stores/todoStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t, tWithParams } from "@/utils/i18n";
import { PORTAL_ACTION_EVENT, type PortalAction } from "@/utils/portalActions";
import type { TodoList } from "@/types";

const TodoSidebar: React.FC = () => {
  const {
    todos,
    lists,
    activeListId,
    addList,
    renameList,
    deleteList,
    toggleListPinned,
    reorderLists,
    setActiveList,
  } = useTodoStore();
  const lang = useSettingsStore((state) => state.lang);
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirmList, setDeleteConfirmList] = useState<TodoList | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const dragCloneRef = useRef<HTMLElement | null>(null);
  const dragTargetRef = useRef<string | null>(null);
  const dragPositionRef = useRef<"before" | "after">("before");
  const cancelRenameRef = useRef(false);

  const orderedLists = useMemo(
    () => [...lists].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.order - b.order;
    }),
    [lists],
  );
  const completedCount = todos.filter((todo) => todo.completed).length;
  const pendingCount = todos.length - completedCount;

  useEffect(() => {
    const handlePortalAction = (event: Event) => {
      if ((event as CustomEvent<PortalAction>).detail !== "new-todo-list") return;
      setNewListName("");
      setCreating(true);
    };
    window.addEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
    return () => window.removeEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
  }, []);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const closeCreate = () => {
    setCreating(false);
    setNewListName("");
  };

  const confirmCreate = () => {
    const name = newListName.trim();
    if (!name) return;
    addList(name);
    closeCreate();
  };

  const startRename = (list: TodoList) => {
    cancelRenameRef.current = false;
    setEditingId(list.id);
    setEditingName(list.name);
  };

  const confirmRename = () => {
    const name = editingName.trim();
    if (!cancelRenameRef.current && editingId && name) renameList(editingId, name);
    cancelRenameRef.current = false;
    setEditingId(null);
    setEditingName("");
  };

  const resetDrag = () => {
    dragCloneRef.current?.remove();
    dragCloneRef.current = null;
    dragTargetRef.current = null;
    dragPositionRef.current = "before";
    setDragOverId(null);
    setDragOverPosition(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  const startDrag = (event: React.MouseEvent, list: TodoList) => {
    if (event.button !== 0 || list.pinned) return;
    event.preventDefault();
    event.stopPropagation();
    const row = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-todo-list-id]");
    if (!row) return;

    const rect = row.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const clone = row.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.88";
    clone.style.boxShadow = "0 8px 24px rgba(0,0,0,0.16)";
    document.body.appendChild(clone);
    dragCloneRef.current = clone;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const onMove = (moveEvent: MouseEvent) => {
      clone.style.top = `${moveEvent.clientY - offsetY}px`;
      const viewport = listContainerRef.current?.getBoundingClientRect();
      if (viewport && (moveEvent.clientX < viewport.left || moveEvent.clientX > viewport.right)) {
        dragTargetRef.current = null;
        setDragOverId(null);
        setDragOverPosition(null);
        return;
      }
      const candidates = Array.from(
        listContainerRef.current?.querySelectorAll<HTMLElement>("[data-todo-list-id]") ?? [],
      ).filter((element) =>
        element.dataset.todoListId !== list.id &&
        element.dataset.listPinned === String(list.pinned)
      );
      let target = candidates.find((element) => {
        const targetRect = element.getBoundingClientRect();
        return moveEvent.clientY >= targetRect.top && moveEvent.clientY <= targetRect.bottom;
      });
      let position: "before" | "after" = "before";
      if (target) {
        const targetRect = target.getBoundingClientRect();
        position = moveEvent.clientY >= targetRect.top + targetRect.height / 2 ? "after" : "before";
      } else {
        target = candidates.find((element) => {
          const targetRect = element.getBoundingClientRect();
          return moveEvent.clientY < targetRect.top + targetRect.height / 2;
        });
        if (!target && candidates.length > 0) {
          target = candidates[candidates.length - 1];
          position = "after";
        }
      }
      const targetId = target?.dataset.todoListId ?? null;
      dragTargetRef.current = targetId;
      dragPositionRef.current = position;
      setDragOverId(targetId);
      setDragOverPosition(targetId ? position : null);
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const viewport = listContainerRef.current?.getBoundingClientRect();
      const insideViewport = !viewport || (upEvent.clientX >= viewport.left && upEvent.clientX <= viewport.right);
      if (insideViewport && dragTargetRef.current) {
        reorderLists(list.id, dragTargetRef.current, dragPositionRef.current);
      }
      resetDrag();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const confirmDelete = () => {
    if (!deleteConfirmList) return;
    deleteList(deleteConfirmList.id, t(lang, "defaultTodoList"));
    setDeleteConfirmList(null);
  };

  return (
    <aside className="todo-surface flex h-full w-full flex-col bg-bg-sidebar">
      <div className="border-b border-border bg-gradient-to-b from-accent-light/35 to-transparent px-3 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{t(lang, "todoLists")}</h2>
            <div className="mt-0.5 text-[11px] text-text-muted">
              {tWithParams(lang, "todoListSummary", { lists: lists.length, pending: pendingCount })}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent-light text-accent">
            <ListChecks size={17} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-bg-primary/65 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-text-muted">
              <CircleDot size={12} />
              <span className="text-[11px]">{t(lang, "filterActive")}</span>
            </div>
            <div className="mt-1 text-lg font-semibold leading-none text-text-primary">{pendingCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg-primary/65 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-text-muted">
              <CheckCircle2 size={12} />
              <span className="text-[11px]">{t(lang, "filterCompleted")}</span>
            </div>
            <div className="mt-1 text-lg font-semibold leading-none text-text-primary">{completedCount}</div>
          </div>
        </div>
      </div>

      <div className="px-3 pb-2 pt-3">
        {creating ? (
          <div className="todo-create-panel rounded-xl border border-border p-2.5 focus-within:border-accent/45">
            <div className="mb-2 flex items-center gap-2 px-0.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light text-accent">
                <Plus size={15} strokeWidth={2.5} />
              </div>
              <span className="flex-1 text-sm font-semibold text-text-primary">{t(lang, "newTodoList")}</span>
              <button
                type="button"
                onClick={closeCreate}
                aria-label={t(lang, "confirmNo")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </div>
            <div className="relative">
              <ListChecks size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent" />
              <input
                ref={createInputRef}
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") confirmCreate();
                  if (event.key === "Escape") closeCreate();
                }}
                placeholder={t(lang, "listNamePlaceholder")}
                className="h-10 w-full rounded-lg border border-border bg-bg-primary pl-9 pr-3 text-sm text-text-primary shadow-inner outline-none placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <button onClick={closeCreate} className="h-8 rounded-lg px-3 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary">
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmCreate}
                disabled={!newListName.trim()}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus size={13} strokeWidth={2.5} />
                {t(lang, "add")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="todo-create-trigger group flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary hover:border-accent/40 hover:bg-bg-hover/45"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-transform duration-200 group-hover:rotate-90">
              <Plus size={16} strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block leading-tight">{t(lang, "newTodoList")}</span>
              <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">{t(lang, "listNamePlaceholder")}</span>
            </span>
            <span className="mr-0.5 h-1.5 w-1.5 rounded-full bg-accent opacity-45 transition-opacity duration-200 group-hover:opacity-100" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        <span>{t(lang, "todoLists")}</span>
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-accent/20 bg-accent-light px-1.5 text-[11px] font-semibold leading-none tabular-nums tracking-normal text-accent">
          {lists.length}
        </span>
      </div>

      <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {orderedLists.map((list) => {
          const listTodos = todos.filter((todo) => todo.listId === list.id);
          const listPending = listTodos.filter((todo) => !todo.completed).length;
          const isActive = activeListId === list.id;
          const isEditing = editingId === list.id;
          return (
            <div
              key={list.id}
              data-todo-list-id={list.id}
              data-list-pinned={String(list.pinned)}
              className={`group relative mb-1 rounded-xl transition-all duration-200 ${
                dragOverId === list.id ? "scale-[1.015] bg-accent-light/40" : ""
              }`}
            >
              {dragOverId === list.id && dragOverPosition && (
                <span
                  aria-hidden="true"
                  className={`drag-insertion-line drag-insertion-line--${dragOverPosition}`}
                />
              )}
              {isEditing ? (
                <div className="todo-create-panel flex h-11 items-center gap-1.5 rounded-xl border border-accent/40 bg-bg-primary px-2 ring-2 ring-accent/15">
                  {list.pinned
                    ? <Pin size={13} className="flex-shrink-0 text-accent" />
                    : <GripVertical size={13} className="flex-shrink-0 text-text-muted" />}
                  <input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        cancelRenameRef.current = true;
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
                  />
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setActiveList(list.id)}
                    onDoubleClick={() => startRename(list)}
                    data-todo-row-button
                    className={`relative flex h-11 w-full items-center gap-2 overflow-hidden rounded-xl border pl-2 pr-[76px] text-left text-sm ${
                      isActive
                        ? "todo-list-active border-accent/20 font-medium text-text-primary"
                        : "border-transparent text-text-secondary hover:border-border hover:bg-bg-primary/55 hover:text-text-primary"
                    }`}
                  >
                    {isActive && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-accent" />}
                    {!list.pinned && (
                      <span
                        onMouseDown={(event) => startDrag(event, list)}
                        onClick={(event) => event.stopPropagation()}
                        title={t(lang, "dragTodoList")}
                        className="flex-shrink-0 cursor-grab text-text-muted opacity-35 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                      >
                        <GripVertical size={13} />
                      </span>
                    )}
                    {list.pinned && <Pin size={13} className="flex-shrink-0 text-accent" />}
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${
                      isActive ? "bg-accent text-white" : "bg-bg-primary/70 text-text-muted"
                    }`}>
                      <ListChecks size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                    <span
                      className={`absolute right-2 inline-flex h-[18px] min-w-[34px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums tracking-tight shadow-sm group-hover:hidden ${
                        isActive
                          ? "bg-accent/10 text-accent"
                          : "border border-border/70 bg-bg-primary/70 text-text-muted"
                      }`}
                    >
                      {listPending}/{listTodos.length}
                    </span>
                  </button>
                  <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                    <button
                      onClick={() => toggleListPinned(list.id)}
                      title={list.pinned ? t(lang, "unpinTodoList") : t(lang, "pinTodoList")}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-bg-primary hover:text-accent"
                    >
                      {list.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button
                      onClick={() => startRename(list)}
                      title={t(lang, "renameTodoList")}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-bg-primary hover:text-text-primary"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmList(list)}
                      title={t(lang, "deleteTodoList")}
                      className="rounded-lg p-1.5 text-text-muted hover:bg-bg-primary hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {deleteConfirmList && (
        <div className="todo-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/35" onMouseDown={() => setDeleteConfirmList(null)}>
          <div
            className="todo-modal-panel w-[340px] overflow-hidden rounded-xl border border-border bg-bg-primary shadow-xl"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-4 pb-3 pt-4">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <Trash2 size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t(lang, "deleteTodoList")}</div>
                  <div className="mt-0.5 truncate text-xs text-text-muted">{deleteConfirmList.name}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                {t(lang, "confirmDeleteTodoListMessage")
                  .replace("{list}", deleteConfirmList.name)
                  .replace("{count}", String(todos.filter((todo) => todo.listId === deleteConfirmList.id).length))}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setDeleteConfirmList(null)}
                className="h-8 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmDelete}
                className="h-8 rounded-lg bg-danger px-3 text-sm text-white transition-colors hover:bg-danger/90"
              >
                {t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default TodoSidebar;
