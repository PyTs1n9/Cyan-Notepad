import React, { useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  FileDown,
  FileText,
  FileUp,
  Plus,
  Tag,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Pin,
  PinOff,
} from "lucide-react";
import { UNCATEGORIZED_CATEGORY_ID, useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { deleteNoteFile } from "@/utils/storage";
import type { Note, NoteCategory, ViewType } from "@/types";
import { SIDEBAR_LABEL_MIN_WIDTH } from "@/components/Layout/sidebarLayout";

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onNewNote: () => void;
  onImportTextNotes: () => void;
  onExportActiveNote: () => void;
  collapsed: boolean;
  width: number;
  onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  onNewNote,
  onImportTextNotes,
  onExportActiveNote,
  collapsed,
  width,
  onToggleCollapse,
}) => {
  const {
    notes,
    categories,
    filterTag,
    setFilterTag,
    activeNoteId,
    setActiveNoteId,
    deleteNote,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    reorderNotes,
    togglePinned,
    updateNote,
    activeCategoryId,
    setActiveCategoryId,
    getFilteredNotes,
  } = useNoteStore();
  const lang = useSettingsStore((s) => s.lang);

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<Note | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);
  const dragOverNoteIdRef = useRef<string | null>(null);

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));
  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories],
  );
  const visibleNotes = getFilteredNotes();
  const actionBase = "flex items-center justify-center rounded-lg transition-colors cursor-pointer";
  const actionCollapsed = "w-10 h-10 shrink-0";
  const actionSecondary =
    "border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary";
  const navActionBase = `${actionBase} border border-border`;
  const navActionActive = "bg-accent text-white border-accent font-medium hover:bg-accent-hover";
  const navActionInactive = "bg-bg-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary";
  const categoryViewportStyle = {
    maxHeight: "calc(11 * 1.75rem + 10 * 0.125rem)",
    scrollbarGutter: "stable",
  } satisfies React.CSSProperties;
  const renderRailDivider = () => <div className="my-1 h-px w-8 bg-border" aria-hidden="true" />;
  const showActionLabels = !collapsed && width >= SIDEBAR_LABEL_MIN_WIDTH[lang];
  const showBrandMark = !collapsed && width >= 212;
  const labeledActionClass = showActionLabels ? "justify-center gap-1.5" : "justify-center px-0";
  const renderActionLabel = (label: string) =>
    showActionLabels ? <span className="whitespace-nowrap">{label}</span> : null;

  const renderSectionDivider = () => (
    <div className="px-3 py-2" aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <span className="h-[3px] w-8 rounded-full bg-accent" />
        <span className="h-[2px] flex-1 rounded-full bg-border" />
      </div>
    </div>
  );

  const getNoteTitle = (note: Note) => note.title.trim() || t(lang, "untitled");

  const handleSelectNote = (noteId: string) => {
    setActiveNoteId(noteId);
    if (currentView !== "note") onViewChange("note");
  };

  const resetDragState = () => {
    dragNodeRef.current?.remove();
    dragNodeRef.current = null;
    setDragOverCategoryId(null);
    setDragOverNoteId(null);
    dragOverNoteIdRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  const setNoteDragTarget = (noteId: string | null) => {
    dragOverNoteIdRef.current = noteId;
    setDragOverNoteId(noteId);
  };

  const getDropTarget = (clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const categoryElement = element?.closest<HTMLElement>("[data-category-id]");
    const noteElement = element?.closest<HTMLElement>("[data-note-id]");
    return {
      categoryId: categoryElement?.dataset.categoryId,
      noteId: noteElement?.dataset.noteId,
    };
  };

  const getCategoryIdAtPoint = (clientX: number, clientY: number) => {
    const categoryElements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category-id]"),
    );
    const target = categoryElements.find((element) => {
      const rect = element.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    });
    return target?.dataset.categoryId;
  };

  const getNoteIdAtPoint = (clientX: number, clientY: number, draggedNoteId: string) => {
    const noteElements = Array.from(document.querySelectorAll<HTMLElement>("[data-note-id]"));
    const target = noteElements.find((element) => {
      if (element.dataset.noteId === draggedNoteId) return false;
      const rect = element.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    });
    return target?.dataset.noteId;
  };

  const getCategoryTitle = (categoryId: string | null) => {
    if (categoryId === UNCATEGORIZED_CATEGORY_ID) return t(lang, "uncategorizedNotes");
    if (!categoryId) return t(lang, "allNotes");
    return categories.find((item) => item.id === categoryId)?.name ?? t(lang, "allNotes");
  };

  const getAssignableCategoryId = (categoryId: string | null) =>
    categoryId === UNCATEGORIZED_CATEGORY_ID ? null : categoryId;

  const confirmMoveNoteToCategory = (noteId: string, categoryId: string | null) => {
    const dragged = notes.find((note) => note.id === noteId);
    if (!dragged || dragged.pinned) return;
    const assignableCategoryId = getAssignableCategoryId(categoryId);
    if ((dragged.categoryId ?? null) === assignableCategoryId) return;

    const category = categoryId && categoryId !== UNCATEGORIZED_CATEGORY_ID
      ? categories.find((item) => item.id === categoryId)
      : null;
    if (categoryId && categoryId !== UNCATEGORIZED_CATEGORY_ID && !category) return;

    const targetName = category?.name ?? getCategoryTitle(categoryId);
    const confirmed = confirm(
      t(lang, "moveNoteToCategoryConfirm")
        .replace("{note}", getNoteTitle(dragged))
        .replace("{category}", targetName),
    );
    if (confirmed) {
      updateNote(noteId, { categoryId: assignableCategoryId });
      setActiveCategoryId(categoryId);
    }
  };

  const startNoteDrag = (event: React.MouseEvent, note: Note, visibleIndex: number) => {
    if (note.pinned) return;
    event.preventDefault();
    event.stopPropagation();

    const itemEls = listRef.current?.children;
    const itemEl = itemEls?.[visibleIndex] as HTMLElement | undefined;
    if (!itemEl) return;

    const startRect = itemEl.getBoundingClientRect();
    const offsetY = event.clientY - startRect.top;
    const clone = itemEl.cloneNode(true) as HTMLElement;
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
    document.body.appendChild(clone);
    dragNodeRef.current = clone;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    let moved = false;
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveEvent: MouseEvent) => {
      clone.style.top = `${moveEvent.clientY - offsetY}px`;

      if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
        moved = true;
      }
      const target = getDropTarget(moveEvent.clientX, moveEvent.clientY);
      const categoryId = getCategoryIdAtPoint(moveEvent.clientX, moveEvent.clientY) ?? target.categoryId;
      setDragOverCategoryId(categoryId ?? null);
      if (categoryId) {
        setNoteDragTarget(null);
        return;
      }

      let nextNoteId =
        getNoteIdAtPoint(moveEvent.clientX, moveEvent.clientY, note.id) ??
        (target.noteId && target.noteId !== note.id ? target.noteId : null);
      if (!nextNoteId && listRef.current) {
        const children = Array.from(listRef.current.children) as HTMLElement[];
        const hovered = children.find((child) => {
          if (child.dataset.noteId === note.id) return false;
          const rect = child.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          return moveEvent.clientY < mid;
        });
        nextNoteId = hovered?.dataset.noteId ?? children[children.length - 1]?.dataset.noteId ?? null;
        if (nextNoteId === note.id) nextNoteId = null;
      }
      setNoteDragTarget(nextNoteId);
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) {
        const target = getDropTarget(upEvent.clientX, upEvent.clientY);
        const categoryId = getCategoryIdAtPoint(upEvent.clientX, upEvent.clientY) ?? target.categoryId;
        if (categoryId !== undefined) {
          confirmMoveNoteToCategory(note.id, categoryId === "all" ? null : categoryId);
        } else {
          const targetNoteId =
            getNoteIdAtPoint(upEvent.clientX, upEvent.clientY, note.id) ??
            (target.noteId && target.noteId !== note.id ? target.noteId : dragOverNoteIdRef.current);
          const targetNote = notes.find((item) => item.id === targetNoteId);
          if (targetNote && !targetNote.pinned) reorderNotes(note.id, targetNote.id);
        }
      }
      resetDragState();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startCategoryDrag = (event: React.MouseEvent, category: NoteCategory, visibleIndex: number) => {
    event.preventDefault();
    event.stopPropagation();

    const itemEls = categoryListRef.current?.children;
    const itemEl = itemEls?.[visibleIndex + 2] as HTMLElement | undefined;
    if (!itemEl) return;

    const startRect = itemEl.getBoundingClientRect();
    const offsetY = event.clientY - startRect.top;
    const clone = itemEl.cloneNode(true) as HTMLElement;
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
    document.body.appendChild(clone);
    dragNodeRef.current = clone;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    let moved = false;
    const startX = event.clientX;
    const startY = event.clientY;

    const onMove = (moveEvent: MouseEvent) => {
      clone.style.top = `${moveEvent.clientY - offsetY}px`;

      if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
        moved = true;
      }
      const target = getDropTarget(moveEvent.clientX, moveEvent.clientY);
      const categoryId = getCategoryIdAtPoint(moveEvent.clientX, moveEvent.clientY) ?? target.categoryId;
      setDragOverCategoryId(
        categoryId && categoryId !== "all" && categoryId !== UNCATEGORIZED_CATEGORY_ID ? categoryId : null,
      );
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) {
        const target = getDropTarget(upEvent.clientX, upEvent.clientY);
        const categoryId = getCategoryIdAtPoint(upEvent.clientX, upEvent.clientY) ?? target.categoryId;
        if (
          categoryId &&
          categoryId !== "all" &&
          categoryId !== UNCATEGORIZED_CATEGORY_ID &&
          categoryId !== category.id
        ) {
          const fromIndex = orderedCategories.findIndex((item) => item.id === category.id);
          const toIndex = orderedCategories.findIndex((item) => item.id === categoryId);
          if (fromIndex >= 0 && toIndex >= 0) reorderCategories(fromIndex, toIndex);
        }
      }
      resetDragState();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleAddCategory = () => {
    setNewCategoryName("");
    setIsCategoryDialogOpen(true);
  };

  const handleMergedImport = () => {
    onImportTextNotes();
  };

  const handleExportFile = () => {
    if (!activeNoteId) return;
    onExportActiveNote();
  };

  const closeCategoryDialog = () => {
    setIsCategoryDialogOpen(false);
    setNewCategoryName("");
  };

  const confirmAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCategory(name.trim());
    onViewChange("note");
    closeCategoryDialog();
  };

  const startRenameCategory = (category: NoteCategory) => {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  };

  const finishRenameCategory = () => {
    if (editingCategoryId && editingCategoryName.trim()) {
      updateCategory(editingCategoryId, editingCategoryName.trim());
    }
    setEditingCategoryId(null);
    setEditingCategoryName("");
  };

  const handleDeleteCategory = (category: NoteCategory) => {
    if (confirm(`${t(lang, "confirmDeleteCategory")}${category.name}"?`)) {
      deleteCategory(category.id);
    }
  };

  const confirmDeleteNote = () => {
    if (!deleteConfirmNote) return;
    const latestNote = notes.find((note) => note.id === deleteConfirmNote.id);
    if (latestNote?.pinned) {
      setDeleteConfirmNote(null);
      return;
    }

    deleteNote(deleteConfirmNote.id);
    deleteNoteFile(deleteConfirmNote.id);
    setDeleteConfirmNote(null);
  };

  const renderCategoryButton = (
    category: NoteCategory | null,
    index = -1,
    options: { uncategorized?: boolean } = {},
  ) => {
    const id = options.uncategorized ? UNCATEGORIZED_CATEGORY_ID : category?.id ?? null;
    const isActive = activeCategoryId === id;
    const isDragOver = dragOverCategoryId === (id ?? "all");
    const noteCount = options.uncategorized
      ? notes.filter((note) => !note.categoryId).length
      : id
        ? notes.filter((note) => note.categoryId === id).length
        : notes.length;
    const title = options.uncategorized ? t(lang, "uncategorizedNotes") : category?.name ?? t(lang, "allNotes");

    return (
      <div
        key={id ?? "all"}
        data-category-id={id ?? "all"}
        className={`group relative rounded-lg ${isDragOver ? "bg-accent-light" : ""}`}
      >
        <button
          onClick={() => setActiveCategoryId(id)}
          className={`w-full h-7 flex items-center gap-2 px-3 rounded-lg text-xs transition-colors cursor-pointer
            ${isActive ? "bg-bg-active text-text-primary" : "text-text-secondary hover:bg-bg-hover"}`}
        >
          {category ? (
            <span
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => startCategoryDrag(e, category, index)}
              className="text-text-muted opacity-50 group-hover:opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing"
              title={t(lang, "dragCategory")}
            >
              <GripVertical size={12} />
            </span>
          ) : options.uncategorized ? (
            <FolderOpen size={12} className="text-text-muted flex-shrink-0" />
          ) : (
            <Folder size={12} className="text-text-muted flex-shrink-0" />
          )}
          {category && editingCategoryId === category.id ? (
            <input
              value={editingCategoryName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditingCategoryName(e.target.value)}
              onBlur={finishRenameCategory}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishRenameCategory();
                if (e.key === "Escape") {
                  setEditingCategoryId(null);
                  setEditingCategoryName("");
                }
              }}
              autoFocus
              className="min-w-0 flex-1 bg-bg-primary text-text-primary border border-border rounded px-1 py-0.5 outline-none"
            />
          ) : (
            <span className="truncate flex-1 text-left">{title}</span>
          )}
          <span className="text-[10px] text-text-muted flex-shrink-0">{noteCount}</span>
        </button>
        {category && editingCategoryId !== category.id && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                startRenameCategory(category);
              }}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover cursor-pointer"
              title={t(lang, "renameCategory")}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteCategory(category);
              }}
              className="p-1 rounded text-text-muted hover:text-danger hover:bg-bg-hover cursor-pointer"
              title={t(lang, "deleteCategory")}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderNoteList = () => (
    <div className="flex-1 flex flex-col min-h-0 px-2">
      {renderSectionDivider()}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div ref={listRef}>
          {visibleNotes.map((note, index) => {
            const isDragOver = dragOverNoteId === note.id;
            return (
              <div
                key={note.id}
                data-note-id={note.id}
                className={`group relative mb-0.5 rounded-lg ${isDragOver ? "bg-accent-light" : ""}`}
              >
                <button
                  onClick={() => handleSelectNote(note.id)}
                  className={`w-full text-left pl-3 pr-16 py-2 rounded-lg text-sm transition-colors cursor-pointer
                    ${activeNoteId === note.id ? "bg-bg-active text-text-primary" : "text-text-secondary hover:bg-bg-hover"}`}
                >
                  <div className="flex items-center gap-1.5">
                    {!note.pinned && (
                      <span
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => startNoteDrag(e, note, index)}
                        className="text-text-muted opacity-45 group-hover:opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing"
                        title={t(lang, "dragNote")}
                      >
                        <GripVertical size={12} />
                      </span>
                    )}
                    {note.pinned && <Pin size={12} className="text-accent flex-shrink-0" />}
                    <div className="truncate font-medium">{note.title || t(lang, "untitled")}</div>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 pl-5">
                    {new Date(note.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}
                  </div>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinned(note.id);
                    }}
                    className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-bg-hover cursor-pointer"
                    title={note.pinned ? t(lang, "unpinNote") : t(lang, "pinNote")}
                  >
                    {note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (note.pinned) return;
                      setDeleteConfirmNote(note);
                    }}
                    disabled={note.pinned}
                    className={`p-1.5 rounded-md transition-colors
                      ${note.pinned
                        ? "text-text-muted/35 cursor-not-allowed"
                        : "text-text-muted hover:text-danger hover:bg-bg-hover cursor-pointer"}`}
                    title={t(lang, "deleteNote")}
                    aria-disabled={note.pinned}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {visibleNotes.length === 0 && (
          <p className="text-xs text-text-muted px-3 py-4 text-center">{t(lang, "noNotes")}</p>
        )}
      </div>
    </div>
  );

  return (
    <aside className="w-full h-full bg-bg-sidebar flex flex-col border-r border-border">
      <div className={collapsed ? "flex flex-col items-center px-2 py-2" : "px-2 pt-2 pb-1.5"}>
        {collapsed ? (
          <>
            <button
              onClick={onToggleCollapse}
              className={`${actionBase} ${actionSecondary} ${actionCollapsed}`}
              title={t(lang, "expandSidebar")}
            >
              <PanelLeftOpen size={16} />
            </button>
            {renderRailDivider()}
            <button
              onClick={() => onViewChange("note")}
              className={`${navActionBase} ${actionCollapsed} mt-1
                ${currentView === "note" ? navActionActive : navActionInactive}`}
              title={t(lang, "notepad")}
            >
              <FileText size={16} />
            </button>
            <button
              onClick={() => onViewChange("todo")}
              className={`${navActionBase} ${actionCollapsed} mt-2
                ${currentView === "todo" ? navActionActive : navActionInactive}`}
              title={t(lang, "todo")}
            >
              <CheckSquare size={16} />
            </button>
            {renderRailDivider()}
            <button
              onClick={() => {
                onNewNote();
                onViewChange("note");
              }}
              className={`${actionBase} ${actionSecondary} ${actionCollapsed} mt-1`}
              title={t(lang, "newNote")}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={handleAddCategory}
              className={`${actionBase} ${actionSecondary} ${actionCollapsed} mt-2`}
              title={t(lang, "newCategory")}
            >
              <FolderPlus size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 px-1 pb-2">
              {showBrandMark && (
                <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  C
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold text-text-primary whitespace-nowrap">Cyan Notepad</div>
              </div>
              <button
                onClick={onToggleCollapse}
                className={`${actionBase} ${actionSecondary} w-8 h-8 flex-shrink-0`}
                title={t(lang, "collapseSidebar")}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onViewChange("note")}
                className={`${navActionBase} h-9 px-2 text-sm min-w-0 ${labeledActionClass}
                  ${currentView === "note" ? navActionActive : navActionInactive}`}
                title={t(lang, "notepad")}
                aria-label={t(lang, "notepad")}
              >
                <FileText size={15} className="flex-shrink-0" />
                {renderActionLabel(t(lang, "notepad"))}
              </button>
              <button
                onClick={() => onViewChange("todo")}
                className={`${navActionBase} h-9 px-2 text-sm min-w-0 ${labeledActionClass}
                  ${currentView === "todo" ? navActionActive : navActionInactive}`}
                title={t(lang, "todo")}
                aria-label={t(lang, "todo")}
              >
                <CheckSquare size={15} className="flex-shrink-0" />
                {renderActionLabel(t(lang, "todo"))}
              </button>
              <button
                onClick={() => {
                  onNewNote();
                  onViewChange("note");
                }}
                className={`${actionBase} ${actionSecondary} h-9 px-2 text-sm min-w-0 ${labeledActionClass}`}
                title={t(lang, "newNote")}
                aria-label={t(lang, "newNote")}
              >
                <Plus size={15} className="flex-shrink-0" />
                {renderActionLabel(t(lang, "newNote"))}
              </button>
              <button
                onClick={handleAddCategory}
                className={`${actionBase} ${actionSecondary} h-9 px-2 text-sm min-w-0 ${labeledActionClass}`}
                title={t(lang, "newCategory")}
                aria-label={t(lang, "newCategory")}
              >
                <FolderPlus size={15} className="flex-shrink-0" />
                {renderActionLabel(t(lang, "newCategory"))}
              </button>
              <div className="col-span-2 grid grid-cols-2 gap-1 min-w-0">
                <button
                  onClick={handleMergedImport}
                  className={`${actionBase} ${actionSecondary} h-9 min-w-0 px-2 text-sm font-medium ${labeledActionClass}`}
                  title={t(lang, "importNote")}
                  aria-label={t(lang, "importNote")}
                >
                  <FileUp size={15} className="flex-shrink-0" />
                  {renderActionLabel(t(lang, "importNote"))}
                </button>
                <button
                  onClick={handleExportFile}
                  disabled={!activeNoteId}
                  className={`${actionBase} ${actionSecondary} h-9 min-w-0 px-2 text-sm font-medium ${labeledActionClass}
                    ${activeNoteId ? "" : "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-text-secondary"}`}
                  title={t(lang, "exportFile")}
                  aria-label={t(lang, "exportFile")}
                >
                  <FileDown size={15} className="flex-shrink-0" />
                  {renderActionLabel(t(lang, "exportFile"))}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="px-2 mt-2">
          {renderSectionDivider()}
          <div
            className="overflow-y-scroll pr-1 [scrollbar-gutter:stable]"
            style={categoryViewportStyle}
          >
            <div className="space-y-0.5" ref={categoryListRef}>
              {renderCategoryButton(null)}
              {renderCategoryButton(null, -1, { uncategorized: true })}
              {orderedCategories.map((category, index) => renderCategoryButton(category, index))}
            </div>
          </div>
        </div>
      )}

      {!collapsed && renderNoteList()}

      {!collapsed && allTags.length > 0 && (
        <div className="px-2 mb-3">
          <div className="text-xs text-text-muted px-3 py-1 uppercase tracking-wide flex items-center gap-1">
            <Tag size={10} />
            <span>{t(lang, "tags")}</span>
          </div>
          <div className="flex flex-wrap gap-1 px-3 py-1">
            <button
              onClick={() => setFilterTag(null)}
              className={`px-2 py-0.5 rounded-full text-xs cursor-pointer
                ${!filterTag ? "bg-accent text-white" : "bg-bg-hover text-text-secondary hover:bg-bg-active"}`}
            >
              {t(lang, "all")}
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-xs cursor-pointer
                  ${tag === filterTag ? "bg-accent text-white" : "bg-bg-hover text-text-secondary hover:bg-bg-active"}`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {isCategoryDialogOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 px-4">
          <div
            className="w-full max-w-[320px] rounded-lg border border-border bg-bg-primary shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-accent flex-shrink-0">
                  <FolderPlus size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t(lang, "newCategory")}</div>
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {t(lang, "categoryNamePrompt")}
                  </div>
                </div>
              </div>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddCategory();
                  if (e.key === "Escape") closeCategoryDialog();
                }}
                autoFocus
                className="mt-4 h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:bg-bg-primary"
                placeholder={t(lang, "categoryNamePrompt")}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={closeCategoryDialog}
                className="h-8 px-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmAddCategory}
                disabled={!newCategoryName.trim()}
                className="h-8 px-3 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmNote && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))" }}
        >
          <div
            className="w-full max-w-[320px] overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center text-danger flex-shrink-0">
                  <Trash2 size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t(lang, "deleteNote")}</div>
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {getNoteTitle(deleteConfirmNote)}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                {t(lang, "confirmDeleteNoteMessage").replace("{note}", getNoteTitle(deleteConfirmNote))}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={() => setDeleteConfirmNote(null)}
                className="h-8 px-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmDeleteNote}
                className="h-8 px-3 rounded-lg bg-danger text-white text-sm hover:bg-danger/90 transition-colors cursor-pointer"
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

export default Sidebar;
