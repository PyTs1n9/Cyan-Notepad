import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  buildNoteTree,
  collectFolderIds,
  flattenNoteTree,
  getTreeIndent,
  isFolderExpanded,
  type NoteTreeFolder,
  type TreeRow,
} from "@/components/Layout/noteTreeModel";
import TreeContextMenu, { type TreeMenuItem } from "@/components/Layout/TreeContextMenu";
import MoveToFolderDialog, { type MoveTarget } from "@/components/Layout/MoveToFolderDialog";
import { UNCATEGORIZED_CATEGORY_ID, useNoteStore } from "@/stores/noteStore";
import { useTabStore } from "@/stores/tabStore";
import { useSettingsStore, type LangType } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { deleteNoteToTrash } from "@/utils/noteDeletion";
import type { Note, NoteCategory } from "@/types";

interface NoteTreeProps {
  lang: LangType;
  onOpenNote: (noteId: string) => void;
  onRequestDeleteNote: (note: Note) => void;
  onRequestDeleteCategory: (category: NoteCategory) => void;
  /** Creates a note inside `folderId` (uncategorized uses the sentinel id). */
  onRequestNewNote: (folderId: string | null) => void;
  /** Creates an unnamed folder immediately; `parentId` nests it. */
  onRequestNewCategory: (parentId: string | null) => void;
  /** Folder created from outside the tree that still needs an inline rename. */
  autoRenameCategoryId?: string | null;
  onAutoRenameHandled?: () => void;
}

type DropTarget =
  | { kind: "folder"; id: string }
  | { kind: "note"; id: string; position: "before" | "after" };

const folderAssignableId = (folderId: string | null) =>
  folderId === UNCATEGORIZED_CATEGORY_ID ? null : folderId;

const NoteTree: React.FC<NoteTreeProps> = ({
  lang,
  onOpenNote,
  onRequestDeleteNote,
  onRequestDeleteCategory,
  onRequestNewNote,
  onRequestNewCategory,
  autoRenameCategoryId = null,
  onAutoRenameHandled,
}) => {
  const {
    notes,
    categories,
    searchQuery,
    filterTag,
    activeNoteId,
    activeCategoryId,
    setActiveCategoryId,
    updateCategory,
    updateNote,
    reorderNotes,
    togglePinned,
    toggleCategoryPinned,
    moveCategory,
    deleteCategory,
  } = useNoteStore();
  const expandedIds = useSettingsStore((s) => s.expandedFolderIds);
  const setExpandedFolderIds = useSettingsStore((s) => s.setExpandedFolderIds);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; row: TreeRow | null } | null>(null);
  const [moveDialogNote, setMoveDialogNote] = useState<Note | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const dragCloneRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Remembers whether the last row picked was a note; Delete only acts on that.
  const lastSelectionRef = useRef<"note" | "folder" | null>(null);

  const tree = useMemo(
    () =>
      buildNoteTree(notes, categories, { searchQuery, filterTag }, t(lang, "uncategorizedNotes")),
    [notes, categories, searchQuery, filterTag, lang],
  );
  const allFolderIds = useMemo(() => collectFolderIds(tree), [tree]);
  // While filtering, every surviving branch is opened so hits are never hidden
  // behind a collapsed folder.
  const forceExpand = searchQuery.trim().length > 0 || Boolean(filterTag);

  const isExpanded = (id: string) => forceExpand || isFolderExpanded(expandedIds, id);

  // Every folder nested under the selected one, so its rows can be tinted.
  const activeSubtreeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeCategoryId || activeCategoryId === UNCATEGORIZED_CATEGORY_ID) return ids;
    const stack: string[] = [activeCategoryId];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const category of categories) {
        if ((category.parentId ?? null) === current && !ids.has(category.id)) {
          ids.add(category.id);
          stack.push(category.id);
        }
      }
    }
    return ids;
  }, [activeCategoryId, categories]);

  /** True when the row belongs to the selected folder, itself included. */
  const isInsideActiveFolder = (folderId: string | null) => {
    if (!activeCategoryId) return false;
    if (activeCategoryId === UNCATEGORIZED_CATEGORY_ID) return folderId === null;
    if (!folderId) return false;
    return folderId === activeCategoryId || activeSubtreeIds.has(folderId);
  };

  const rows = useMemo(
    () => flattenNoteTree(tree, isExpanded),
    // isExpanded derives from forceExpand + expandedIds, both listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, expandedIds, forceExpand],
  );

  const setDropTargetSafe = (target: DropTarget | null) => {
    dropTargetRef.current = target;
    setDropTarget(target);
  };

  useEffect(() => () => {
    dragCloneRef.current?.remove();
    dragCloneRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const toggleFolder = (id: string) => {
    if (expandedIds === null) {
      // First interaction materializes the implicit "all expanded" default.
      setExpandedFolderIds(allFolderIds.filter((folderId) => folderId !== id));
      return;
    }
    setExpandedFolderIds(
      expandedIds.includes(id)
        ? expandedIds.filter((folderId) => folderId !== id)
        : [...expandedIds, id],
    );
  };

  const handleSelectFolder = (row: TreeRow & { kind: "folder" }) => {
    lastSelectionRef.current = "folder";
    setActiveCategoryId(row.folder.id);
    // Selecting a folder never folds it; clicking a collapsed row opens it so a
    // single click always reveals the folder the user just picked.
    if (!isExpanded(row.folder.id) && expandedIds !== null) {
      setExpandedFolderIds([...expandedIds, row.folder.id]);
    }
  };

  // A single click opens a replaceable preview tab; a double click pins it.
  const handleSelectNote = (note: Note) => {
    lastSelectionRef.current = "note";
    useTabStore.getState().openTab(note.id, { preview: true });
    onOpenNote(note.id);
  };

  const handlePinNote = (note: Note) => {
    useTabStore.getState().pinTab(note.id);
    onOpenNote(note.id);
  };

  const startRename = (category: NoteCategory) => {
    setEditingFolderId(category.id);
    setEditingName(category.name);
  };

  const finishRename = () => {
    const targetId = editingFolderId;
    const nextName = editingName.trim();
    setEditingFolderId(null);
    setEditingName("");
    if (!targetId) return;
    if (nextName) {
      updateCategory(targetId, nextName);
      return;
    }
    // A folder that never got a name is thrown away instead of leaving a blank row.
    const category = categories.find((item) => item.id === targetId);
    if (category && !category.name.trim()) deleteCategory(targetId);
  };

  const ensureExpanded = (id: string) => {
    if (expandedIds === null || expandedIds.includes(id)) return;
    setExpandedFolderIds([...expandedIds, id]);
  };

  // A folder created from the header / context menu arrives with an empty name;
  // open its inline rename so the user can type it straight away.
  useEffect(() => {
    if (!autoRenameCategoryId) return;
    const category = categories.find((item) => item.id === autoRenameCategoryId);
    if (category) {
      if (category.parentId) ensureExpanded(category.parentId);
      setEditingFolderId(category.id);
      setEditingName(category.name);
    }
    onAutoRenameHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRenameCategoryId]);

  // Delete removes the selected note right away; it still lands in the recycle
  // bin, so the action stays reversible. Text fields, open menus and dialogs keep
  // the key for themselves.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      }
      if (menu || moveDialogNote || editingNoteId || editingFolderId) return;
      if (document.querySelector(".app-modal-backdrop")) return;
      if (lastSelectionRef.current !== "note" || !activeNoteId) return;
      const note = notes.find((item) => item.id === activeNoteId);
      if (!note || note.pinned) return;
      event.preventDefault();
      void deleteNoteToTrash(note);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu, moveDialogNote, editingNoteId, editingFolderId, activeNoteId, notes]);

  const startNoteRename = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteTitle(note.title);
  };

  const finishNoteRename = () => {
    if (editingNoteId && editingNoteTitle.trim()) {
      updateNote(editingNoteId, { title: editingNoteTitle.trim() });
    }
    setEditingNoteId(null);
    setEditingNoteTitle("");
  };

  const openContextMenu = (event: React.MouseEvent, row: TreeRow) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, row });
  };

  const moveTargets = useMemo<MoveTarget[]>(() => {
    const out: MoveTarget[] = [];
    const walk = (folders: NoteTreeFolder[], depth: number) => {
      for (const folder of folders) {
        if (folder.virtual) continue;
        out.push({ id: folder.id, label: folder.name, depth });
        walk(folder.folders, depth + 1);
      }
    };
    walk(tree, 0);
    out.push({ id: null, label: t(lang, "uncategorizedNotes"), depth: 0 });
    return out;
  }, [tree, lang]);

  const buildMenuItems = (row: TreeRow | null): TreeMenuItem[] => {
    if (!row) {
      return [
        {
          key: "new-note",
          label: t(lang, "newNote"),
          icon: <FilePlus2 size={12} />,
          onSelect: () => onRequestNewNote(null),
        },
        {
          key: "new-folder",
          label: t(lang, "newCategory"),
          icon: <FolderPlus size={12} />,
          onSelect: () => onRequestNewCategory(null),
        },
      ];
    }
    if (row.kind === "folder") {
      const folder = row.folder;
      const category = folder.virtual
        ? null
        : categories.find((item) => item.id === folder.id) ?? null;
      const items: TreeMenuItem[] = [
        {
          key: "new-note",
          label: t(lang, "newNote"),
          icon: <FilePlus2 size={12} />,
          onSelect: () => onRequestNewNote(folder.virtual ? UNCATEGORIZED_CATEGORY_ID : folder.id),
        },
      ];
      if (category) {
        items.push({
          key: "new-subfolder",
          label: t(lang, "newSubfolder"),
          icon: <FolderPlus size={12} />,
          onSelect: () => {
            ensureExpanded(category.id);
            onRequestNewCategory(category.id);
          },
        });
        items.push({
          key: "rename",
          label: t(lang, "renameCategory"),
          icon: <Pencil size={12} />,
          onSelect: () => startRename(category),
        });
        items.push({
          key: "pin",
          label: t(lang, category.pinned ? "unpinCategory" : "pinCategory"),
          icon: category.pinned ? <PinOff size={12} /> : <Pin size={12} />,
          onSelect: () => toggleCategoryPinned(category.id),
        });
        items.push({
          key: "delete",
          label: t(lang, "deleteCategory"),
          icon: <Trash2 size={12} />,
          danger: true,
          separatorBefore: true,
          onSelect: () => onRequestDeleteCategory(category),
        });
      }
      return items;
    }

    const note = row.note;
    return [
      {
        key: "rename",
        label: t(lang, "renameNote"),
        icon: <Pencil size={12} />,
        onSelect: () => startNoteRename(note),
      },
      {
        key: "pin",
        label: t(lang, note.pinned ? "unpinNote" : "pinNote"),
        icon: note.pinned ? <PinOff size={12} /> : <Pin size={12} />,
        onSelect: () => togglePinned(note.id),
      },
      {
        key: "move",
        label: t(lang, "moveToFolder"),
        icon: <FolderInput size={12} />,
        onSelect: () => setMoveDialogNote(note),
      },
      {
        key: "delete",
        label: t(lang, "deleteNote"),
        icon: <Trash2 size={12} />,
        danger: true,
        separatorBefore: true,
        disabled: note.pinned,
        onSelect: () => onRequestDeleteNote(note),
      },
    ];
  };

  const getNoteTitle = (note: Note) => note.title.trim() || t(lang, "untitled");

  /** Resolves the folder row / note row currently under the pointer. */
  const findDropTarget = (clientX: number, clientY: number): DropTarget | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const folderEl = element?.closest<HTMLElement>("[data-tree-folder-id]");
    if (folderEl?.dataset.treeFolderId) {
      return { kind: "folder", id: folderEl.dataset.treeFolderId };
    }
    const noteEl = element?.closest<HTMLElement>("[data-tree-note-id]");
    const noteId = noteEl?.dataset.treeNoteId;
    if (noteEl && noteId) {
      const rect = noteEl.getBoundingClientRect();
      return {
        kind: "note",
        id: noteId,
        position: clientY >= rect.top + rect.height / 2 ? "after" : "before",
      };
    }
    return null;
  };

  const beginDrag = (event: React.MouseEvent, rowElement: HTMLElement | null) => {
    if (!rowElement || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startRect = rowElement.getBoundingClientRect();
    const offsetY = event.clientY - startRect.top;
    const clone = rowElement.cloneNode(true) as HTMLElement;
    clone.style.position = "fixed";
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.zIndex = "9999";
    clone.style.pointerEvents = "none";
    clone.style.opacity = "0.85";
    clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
    clone.style.borderRadius = "8px";
    document.body.appendChild(clone);
    dragCloneRef.current = clone;

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
      setDropTargetSafe(findDropTarget(moveEvent.clientX, moveEvent.clientY));
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragCloneRef.current?.remove();
      dragCloneRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const target = moved ? findDropTarget(upEvent.clientX, upEvent.clientY) : null;
      setDropTargetSafe(null);
      if (!moved) return;
      if (target) {
        resolveDrop(rowElement, target);
        return;
      }
      // Dropping into empty space below the rows sends the item back to the root.
      const bounds = scrollRef.current?.getBoundingClientRect();
      const inside = bounds
        && upEvent.clientX >= bounds.left
        && upEvent.clientX <= bounds.right
        && upEvent.clientY >= bounds.top
        && upEvent.clientY <= bounds.bottom;
      if (inside) resolveDropToRoot(rowElement);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resolveDrop = (rowElement: HTMLElement, target: DropTarget) => {
    const noteId = rowElement.dataset.treeNoteId;
    const folderId = rowElement.dataset.treeFolderId;

    if (noteId) {
      const dragged = notes.find((note) => note.id === noteId);
      if (!dragged) return;
      if (target.kind === "folder") {
        const nextCategoryId = folderAssignableId(target.id);
        if ((dragged.categoryId ?? null) === nextCategoryId) return;
        updateNote(dragged.id, { categoryId: nextCategoryId });
        ensureExpanded(target.id);
        return;
      }
      const targetNote = notes.find((note) => note.id === target.id);
      if (!targetNote || targetNote.pinned || targetNote.id === dragged.id) return;
      if ((targetNote.categoryId ?? null) !== (dragged.categoryId ?? null)) {
        updateNote(dragged.id, { categoryId: targetNote.categoryId ?? null });
        return;
      }
      reorderNotes(dragged.id, targetNote.id, target.position);
      return;
    }

    if (folderId && target.kind === "folder") {
      // Dropping a folder onto another folder nests it; dropping onto the
      // uncategorized bucket lifts it back to the root.
      const nextParent = target.id === UNCATEGORIZED_CATEGORY_ID ? null : target.id;
      moveCategory(folderId, nextParent);
      if (nextParent) ensureExpanded(nextParent);
    }
  };

  const resolveDropToRoot = (rowElement: HTMLElement) => {
    const noteId = rowElement.dataset.treeNoteId;
    const folderId = rowElement.dataset.treeFolderId;
    if (noteId) {
      updateNote(noteId, { categoryId: null });
      return;
    }
    if (folderId && folderId !== UNCATEGORIZED_CATEGORY_ID) {
      moveCategory(folderId, null);
    }
  };

  const renderFolderRow = (row: TreeRow & { kind: "folder" }) => {
    const { folder, depth, noteCount, folderCount, expanded } = row;
    const isActive = activeCategoryId === (folder.virtual ? UNCATEGORIZED_CATEGORY_ID : folder.id);
    const isDropInside = dropTarget?.kind === "folder" && dropTarget.id === folder.id;
    const category = folder.virtual
      ? null
      : categories.find((item) => item.id === folder.id) ?? null;
    const indent = getTreeIndent(depth);
    const insideActive = isInsideActiveFolder(folder.id);

    return (
      <div
        key={`folder:${folder.id}`}
        data-tree-row
        data-tree-folder-id={folder.id}
        onContextMenu={(event) => openContextMenu(event, row)}
        className={`group relative mb-0.5 rounded-lg ${isDropInside ? "drag-target-inside" : ""}`}
      >
        <div
          className={`flex h-8 w-full items-center gap-1.5 rounded-lg border pr-2 text-xs transition-colors
            ${isActive
              ? "flat-active-row border-accent/20 text-text-primary"
              : `border-transparent text-text-secondary ${insideActive ? "tree-subtree-tint" : "hover:bg-bg-hover"}`}`}
          style={{ paddingLeft: indent + 4 }}
        >
          <button
            type="button"
            onClick={() => toggleFolder(folder.id)}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-text-muted hover:text-text-primary cursor-pointer"
            title={t(lang, expanded ? "collapseFolder" : "expandFolder")}
            aria-label={t(lang, expanded ? "collapseFolder" : "expandFolder")}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            onClick={() => handleSelectFolder(row)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
            title={folder.name || t(lang, "unnamedFolder")}
          >
            <span
              onMouseDown={category
                ? (event) => beginDrag(event, event.currentTarget.closest<HTMLElement>("[data-tree-row]"))
                : undefined}
              className={`flex-shrink-0 text-text-muted ${category ? "cursor-grab active:cursor-grabbing" : ""}`}
              title={category ? t(lang, "dragCategory") : undefined}
            >
              {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
            </span>
            {category && editingFolderId === category.id ? (
              <input
                value={editingName}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditingName(event.target.value)}
                onBlur={finishRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") finishRename();
                  if (event.key === "Escape") {
                    setEditingFolderId(null);
                    setEditingName("");
                  }
                }}
                autoFocus
                className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-1 py-0.5 text-xs text-text-primary outline-none"
              />
            ) : (
              <span className={`min-w-0 flex-1 truncate font-medium ${folder.name ? "" : "italic text-text-muted"}`}>
                {folder.name || t(lang, "unnamedFolder")}
              </span>
            )}
            {folder.pinned && <Pin size={10} className="flex-shrink-0 text-accent" />}
            <span
              className={`inline-flex h-[17px] min-w-[17px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none tabular-nums
                ${isActive
                  ? "bg-accent text-white"
                  : "border border-border/70 bg-bg-primary/70 text-text-muted"}
                ${category ? "group-hover:hidden" : ""}`}
            >
              {noteCount}
            </span>
          </button>
          {folderCount > 0 && !category && (
            <span className="flex-shrink-0 text-[10px] text-text-muted">{folderCount}</span>
          )}
        </div>
      </div>
    );
  };

  const renderNoteRow = (row: TreeRow & { kind: "note" }) => {
    const { note, depth } = row;
    const isActive = activeNoteId === note.id;
    const isDropBefore = dropTarget?.kind === "note" && dropTarget.id === note.id && dropTarget.position === "before";
    const isDropAfter = dropTarget?.kind === "note" && dropTarget.id === note.id && dropTarget.position === "after";
    const indent = getTreeIndent(depth);
    const insideActive = isInsideActiveFolder(row.folderId);

    return (
      <div
        key={`note:${note.id}`}
        data-tree-row
        data-tree-note-id={note.id}
        onContextMenu={(event) => openContextMenu(event, row)}
        className="group relative mb-0.5 rounded-lg"
      >
        {isDropBefore && <span aria-hidden="true" className="drag-insertion-line drag-insertion-line--before" />}
        {isDropAfter && <span aria-hidden="true" className="drag-insertion-line drag-insertion-line--after" />}
        <div
          className={`flex h-8 w-full items-center gap-1.5 rounded-lg border pr-2 text-sm transition-colors
            ${isActive
              ? "flat-active-row border-accent/20 text-text-primary"
              : `border-transparent text-text-secondary ${insideActive ? "tree-subtree-tint" : "hover:bg-bg-hover"}`}`}
          style={{ paddingLeft: indent + 4 }}
        >
          <span
            onMouseDown={note.pinned
              ? undefined
              : (event) => beginDrag(event, event.currentTarget.closest<HTMLElement>("[data-tree-row]"))}
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded
              ${isActive
                ? "bg-accent text-white"
                : note.pinned
                  ? "bg-accent-light text-accent"
                  : "text-text-muted"}
              ${note.pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
            title={note.pinned ? t(lang, "pinNote") : t(lang, "dragNote")}
          >
            {note.pinned ? <Pin size={11} /> : <FileText size={11} />}
          </span>
          {editingNoteId === note.id ? (
            <input
              value={editingNoteTitle}
              onChange={(event) => setEditingNoteTitle(event.target.value)}
              onBlur={finishNoteRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishNoteRename();
                if (event.key === "Escape") {
                  setEditingNoteId(null);
                  setEditingNoteTitle("");
                }
              }}
              autoFocus
              className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-1 py-0.5 text-[13px] text-text-primary outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => handleSelectNote(note)}
              onDoubleClick={() => handlePinNote(note)}
              className="min-w-0 flex-1 truncate text-left text-[13px] font-medium cursor-pointer"
              title={getNoteTitle(note)}
            >
              {getNoteTitle(note)}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-1"
        onContextMenu={(event) => {
          // Right-clicking empty space offers root-level creation.
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, row: null });
        }}
      >
        {rows.map((row) => (row.kind === "folder" ? renderFolderRow(row) : renderNoteRow(row)))}
        {rows.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-text-muted">{t(lang, "noNotes")}</p>
        )}
      </div>
      {menu && (
        <TreeContextMenu
          x={menu.x}
          y={menu.y}
          items={buildMenuItems(menu.row)}
          onClose={() => setMenu(null)}
        />
      )}
      {moveDialogNote && (
        <MoveToFolderDialog
          lang={lang}
          targets={moveTargets}
          currentId={moveDialogNote.categoryId ?? null}
          onSelect={(id) => {
            updateNote(moveDialogNote.id, { categoryId: id });
            setMoveDialogNote(null);
          }}
          onClose={() => setMoveDialogNote(null)}
        />
      )}
    </>
  );
};

export default NoteTree;
