import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkspaceUiStore } from "@/stores/workspaceUi";
import { t } from "@/utils/i18n";
import type { WorkspaceDocumentPublicationStatus } from "@/types/workspace";
import WorkspaceDropdown from "@/components/Workspace/WorkspaceDropdown";
import {
  accessLevelLabel,
  formatDocumentDate,
  publicationStatusLabel,
  roleLabel,
} from "@/components/Workspace/workspaceLabels";

interface FloatingPanelPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

type PublicationFilter = "all" | WorkspaceDocumentPublicationStatus;

/**
 * Explorer column of the workspace view: which workspace, which documents, and
 * everything you can do to one document.
 *
 * It deliberately knows nothing about the shell. The card, the hairline, the
 * width and the resize sash belong to `App.tsx`, exactly as they do for the
 * note and todo explorers - this component only fills the column it is given.
 *
 * Note for future edits: the menus and the details popover are `position:
 * fixed` and portalled to `document.body` because the shell's frosting rule
 * keeps cards free of stacking contexts. Do not add `transform`, `filter`,
 * `backdrop-filter` or `isolation` to this component's root, or those overlays
 * will be painted under the next card.
 */
const WorkspaceSidebar: React.FC = () => {
  const lang = useSettingsStore((state) => state.lang);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const documents = useWorkspaceStore((state) => state.documents);
  const members = useWorkspaceStore((state) => state.members);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeDocumentId = useWorkspaceStore((state) => state.activeDocumentId);
  const reorderingDocument = useWorkspaceStore((state) => state.reorderingDocument);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const selectDocument = useWorkspaceStore((state) => state.selectDocument);
  const reorderDocument = useWorkspaceStore((state) => state.reorderDocument);

  const openDialog = useWorkspaceUiStore((state) => state.openDialog);
  const openRenameDialog = useWorkspaceUiStore((state) => state.openRenameDialog);
  const requestDelete = useWorkspaceUiStore((state) => state.requestDelete);
  const requestPublicationDialog = useWorkspaceUiStore((state) => state.requestPublicationDialog);
  const openManage = useWorkspaceUiStore((state) => state.openManage);

  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [documentActionMenuId, setDocumentActionMenuId] = useState<string | null>(null);
  const [documentActionMenuPosition, setDocumentActionMenuPosition] = useState<FloatingPanelPosition | null>(null);
  const [documentDetailsId, setDocumentDetailsId] = useState<string | null>(null);
  const [documentDetailsPosition, setDocumentDetailsPosition] = useState<FloatingPanelPosition | null>(null);
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [dragOverDocumentId, setDragOverDocumentId] = useState<string | null>(null);
  const [dragOverDocumentPosition, setDragOverDocumentPosition] = useState<"before" | "after" | null>(null);
  const documentActionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const documentDetailsAnchorRef = useRef<HTMLElement | null>(null);
  const documentListRef = useRef<HTMLDivElement | null>(null);
  const documentDragPreviewRef = useRef<HTMLElement | null>(null);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const canEdit = activeWorkspace?.role === "owner" || activeWorkspace?.role === "editor";

  const filteredDocuments = useMemo(
    () => publicationFilter === "all"
      ? documents
      : documents.filter((document) => document.publicationStatus === publicationFilter),
    [documents, publicationFilter],
  );
  const actionDocument = documents.find((item) => item.id === documentActionMenuId) ?? null;
  const detailedDocument = documents.find((item) => item.id === documentDetailsId) ?? null;
  // The creator's display name lives on the member row, not on the document.
  const detailedDocumentCreator = detailedDocument
    ? members.find((member) => member.userId === detailedDocument.createdBy)?.displayName
      ?? detailedDocument.createdBy
    : null;

  // Switching workspaces must not leave a stale filter hiding every document.
  useEffect(() => {
    setPublicationFilter("all");
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!documentActionMenuId) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-document-action-menu]")) setDocumentActionMenuId(null);
    };
    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDocumentActionMenuId(null);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [documentActionMenuId]);

  useLayoutEffect(() => {
    if (!documentActionMenuId) {
      setDocumentActionMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = documentActionTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 6;
      const width = 168;
      const estimatedHeight = 152;
      // The row scrolled out of view: close instead of parking the menu on an
      // edge the pointer is no longer near.
      if (rect.bottom < viewportPadding || rect.top > window.innerHeight - viewportPadding) {
        setDocumentActionMenuId(null);
        return;
      }
      // A 240px sidebar has no room to the right of the `...` trigger, so the
      // menu prefers the left side and only falls back when that is off screen.
      const preferredLeft = rect.left - gap - width;
      const fallbackLeft = rect.right + gap;
      const left = Math.max(
        viewportPadding,
        Math.min(
          preferredLeft >= viewportPadding ? preferredLeft : fallbackLeft,
          window.innerWidth - viewportPadding - width,
        ),
      );
      const top = Math.max(
        viewportPadding,
        Math.min(rect.top + rect.height / 2 - estimatedHeight / 2, window.innerHeight - viewportPadding - estimatedHeight),
      );
      setDocumentActionMenuPosition({
        left,
        top,
        width,
        maxHeight: Math.max(80, window.innerHeight - viewportPadding * 2),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [documentActionMenuId]);

  useEffect(() => {
    if (!documentDetailsId) return;
    const closeDetails = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-document-details]")) setDocumentDetailsId(null);
    };
    const closeDetailsOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDocumentDetailsId(null);
    };
    document.addEventListener("mousedown", closeDetails);
    document.addEventListener("keydown", closeDetailsOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeDetails);
      document.removeEventListener("keydown", closeDetailsOnEscape);
    };
  }, [documentDetailsId]);

  useLayoutEffect(() => {
    if (!documentDetailsId) {
      setDocumentDetailsPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = documentDetailsAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 6;
      const width = Math.min(340, window.innerWidth - viewportPadding * 2);
      const estimatedHeight = 420;
      if (rect.bottom < viewportPadding || rect.top > window.innerHeight - viewportPadding) {
        setDocumentDetailsId(null);
        return;
      }
      const availableBelow = window.innerHeight - viewportPadding - rect.bottom - gap;
      const availableAbove = rect.top - viewportPadding - gap;
      const openBelow = availableBelow >= estimatedHeight || availableBelow >= availableAbove;
      const maxHeight = Math.max(140, Math.min(estimatedHeight, openBelow ? availableBelow : availableAbove));
      const top = openBelow
        ? Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - maxHeight)
        : Math.max(viewportPadding, rect.top - gap - maxHeight);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - viewportPadding - width),
      );
      setDocumentDetailsPosition({ left, top, width, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [documentDetailsId]);

  const resetDocumentDrag = () => {
    documentDragPreviewRef.current?.remove();
    documentDragPreviewRef.current = null;
    setDraggedDocumentId(null);
    setDragOverDocumentId(null);
    setDragOverDocumentPosition(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  const getDocumentDropTarget = (clientX: number, clientY: number, documentId: string) => {
    const viewport = documentListRef.current?.getBoundingClientRect();
    if (!viewport || clientX < viewport.left || clientX > viewport.right) {
      return { id: null, position: null as "before" | "after" | null };
    }

    const rows = Array.from(
      documentListRef.current?.querySelectorAll<HTMLElement>("[data-document-id]") ?? [],
    ).filter((row) => row.dataset.documentId !== documentId);
    const target = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    }) ?? rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    }) ?? rows[rows.length - 1];
    if (!target) return { id: null, position: null as "before" | "after" | null };

    const rect = target.getBoundingClientRect();
    return {
      id: target.dataset.documentId ?? null,
      position: clientY >= rect.top + rect.height / 2 ? "after" : "before",
    } as const;
  };

  const startDocumentDrag = (
    event: React.MouseEvent<HTMLSpanElement>,
    documentId: string,
  ) => {
    if (!canEdit || reorderingDocument) return;
    event.preventDefault();
    event.stopPropagation();

    const row = event.currentTarget.closest<HTMLElement>("[data-document-row]");
    if (!row) return;

    const startRect = row.getBoundingClientRect();
    const offsetY = event.clientY - startRect.top;
    const preview = row.cloneNode(true) as HTMLElement;
    preview.style.position = "fixed";
    preview.style.left = `${startRect.left}px`;
    preview.style.top = `${startRect.top}px`;
    preview.style.width = `${startRect.width}px`;
    preview.style.zIndex = "9999";
    preview.style.pointerEvents = "none";
    preview.style.opacity = "0.86";
    preview.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)";
    preview.style.borderRadius = "12px";
    preview.style.transition = "none";
    document.body.appendChild(preview);
    documentDragPreviewRef.current = preview;

    setDraggedDocumentId(documentId);
    setDragOverDocumentId(null);
    setDragOverDocumentPosition(null);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    const onMove = (moveEvent: MouseEvent) => {
      preview.style.top = `${moveEvent.clientY - offsetY}px`;
      if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) {
        moved = true;
      }

      const target = getDocumentDropTarget(moveEvent.clientX, moveEvent.clientY, documentId);
      setDragOverDocumentId(target.id);
      setDragOverDocumentPosition(target.position);
    };

    const onUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (moved) {
        const target = getDocumentDropTarget(upEvent.clientX, upEvent.clientY, documentId);
        if (target.id && target.position) {
          void reorderDocument(documentId, target.id, target.position);
        }
      }
      resetDocumentDrag();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const openDocumentPublication = (documentId: string) => {
    setDocumentActionMenuId(null);
    setDocumentDetailsId(null);
    selectDocument(documentId);
    requestPublicationDialog(documentId);
  };

  const openDocumentDetails = (documentId: string) => {
    const anchor = documentActionTriggerRef.current?.closest<HTMLElement>("[data-document-row]");
    if (!anchor) return;
    documentDetailsAnchorRef.current = anchor;
    setDocumentActionMenuId(null);
    setDocumentDetailsId(documentId);
  };

  const publicationFilterOptions: Array<{
    value: PublicationFilter;
    label: string;
    activeClassName: string;
    inactiveClassName: string;
  }> = [
    {
      value: "all",
      label: t(lang, "all"),
      activeClassName: "bg-accent text-on-accent",
      inactiveClassName: "text-text-muted hover:bg-bg-hover hover:text-text-primary",
    },
    {
      value: "draft",
      label: t(lang, "cloudDocumentUnpublished"),
      activeClassName: "bg-text-muted text-bg-primary",
      inactiveClassName: "text-text-muted hover:bg-bg-hover hover:text-text-primary",
    },
    {
      value: "scheduled",
      label: t(lang, "cloudDocumentScheduled"),
      activeClassName: "bg-warning text-white",
      inactiveClassName: "text-warning hover:bg-warning/10",
    },
    {
      value: "published",
      label: t(lang, "cloudDocumentPublished"),
      activeClassName: "bg-success text-on-success",
      inactiveClassName: "text-success hover:bg-success/10",
    },
  ];

  return (
    <>
      <aside className="app-interactive-surface flex h-full w-full min-w-0 flex-col">
        <div className="border-b border-border bg-gradient-to-b from-accent-light/35 to-transparent px-3 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-text-primary">{t(lang, "workspaceTitle")}</h2>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <Users size={11} />
                  <span className="tabular-nums">{workspaces.length}</span>
                </span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileText size={11} />
                  <span className="truncate tabular-nums">{documents.length} {t(lang, "workspaceDocuments")}</span>
                </span>
              </div>
            </div>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent-light text-accent shadow-sm shadow-accent/5">
              <Users size={17} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-primary/65 p-2 shadow-sm shadow-black/[0.03]">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {t(lang, "workspaceName")}
              </span>
              {activeWorkspace && (
                <span className="flex-shrink-0 rounded-full border border-accent/15 bg-accent-light px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {roleLabel(lang, activeWorkspace.role)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <WorkspaceDropdown
                value={activeWorkspaceId ?? ""}
                options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
                onChange={(workspaceId) => void selectWorkspace(workspaceId || null)}
                placeholder={t(lang, "workspace")}
                ariaLabel={t(lang, "workspace")}
                disabled={workspaces.length === 0}
                containerClassName="min-w-0 flex-1"
                triggerClassName="h-9 min-w-0 text-sm font-semibold"
              />
              {activeWorkspace && (
                <button
                  type="button"
                  onClick={() => openManage("permissions")}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent-light text-accent transition-colors hover:border-accent/45 hover:bg-accent/15"
                  title={t(lang, "permissionManagement")}
                  aria-label={t(lang, "permissionManagement")}
                >
                  <ShieldCheck size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {workspaces.length > 0 ? (
          <>
            {canEdit && (
              <div className="px-3 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => openDialog("newDocument")}
                  className="flat-create-trigger group flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary hover:border-accent/40 hover:bg-bg-hover/45"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-transform duration-200 group-hover:-translate-y-0.5">
                    <FilePlus2 size={16} strokeWidth={2.3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-tight">{t(lang, "newCloudDocument")}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">
                      {t(lang, "newCloudDocumentHint")}
                    </span>
                  </span>
                  <Plus size={14} className="mr-0.5 flex-shrink-0 text-accent opacity-55 transition-opacity group-hover:opacity-100" />
                </button>
              </div>
            )}

            <div className={`flex items-center justify-between px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted ${canEdit ? "pt-1" : "pt-3"}`}>
              <span>{t(lang, "workspaceDocuments")}</span>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-accent/20 bg-accent-light px-1.5 text-[11px] font-semibold leading-none tabular-nums tracking-normal text-accent">
                {documents.length}
              </span>
            </div>

            <div className="px-2 pb-2">
              <div
                role="group"
                aria-label={t(lang, "publicationStatus")}
                className="grid grid-cols-4 divide-x divide-border overflow-hidden rounded-lg border border-border bg-bg-primary/35"
              >
                {publicationFilterOptions.map((option) => {
                  const selected = publicationFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPublicationFilter(option.value)}
                      className={`h-7 min-w-0 truncate px-1 text-[10px] font-medium transition-colors ${
                        selected ? option.activeClassName : option.inactiveClassName
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div ref={documentListRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {filteredDocuments.map((document) => {
                const isActive = document.id === activeDocumentId;
                const isDragOver = document.id === dragOverDocumentId;
                const PublicationIcon = document.publicationStatus === "scheduled"
                  ? FileClock
                  : document.publicationStatus === "published"
                    ? FileCheck2
                    : FileText;
                const publicationIconTone = isActive
                  ? document.publicationStatus === "scheduled"
                    ? "bg-warning text-white"
                    : document.publicationStatus === "published"
                      ? "bg-success text-on-success"
                      : "bg-text-muted text-bg-primary"
                  : document.publicationStatus === "scheduled"
                    ? "bg-transparent text-warning hover:bg-warning/10"
                    : document.publicationStatus === "published"
                      ? "bg-transparent text-success hover:bg-success/10"
                      : "bg-transparent text-text-muted hover:bg-bg-primary/70";
                const accessTone = document.accessLevel === "creator"
                  ? "border-warning/20 bg-warning/10 text-warning"
                  : document.accessLevel === "managers"
                    ? "border-accent/20 bg-accent-light text-accent"
                    : "border-success/20 bg-success/10 text-success";
                const documentTimestamp = document.publicationStatus === "scheduled" && document.scheduledPublishAt
                  ? new Date(document.scheduledPublishAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : new Date(document.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US");
                return (
                  <div
                    key={document.id}
                    data-document-row
                    data-document-id={document.id}
                    className={`group relative mb-1 rounded-xl ${
                      isDragOver ? "bg-accent-light/35" : ""
                    } ${draggedDocumentId === document.id ? "opacity-55" : ""}`}
                  >
                    {isDragOver && dragOverDocumentPosition && (
                      <span
                        aria-hidden="true"
                        className={`drag-insertion-line drag-insertion-line--${dragOverDocumentPosition}`}
                      />
                    )}
                    <button
                      type="button"
                      data-flat-row-button
                      onClick={() => selectDocument(document.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`relative flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-xl border py-2 pl-2.5 text-left transition-colors ${canEdit ? "pr-10" : "pr-2.5"} ${
                        isActive
                          ? "flat-active-row border-accent/20 text-text-primary"
                          : "border-transparent text-text-secondary hover:border-border hover:bg-bg-primary/55 hover:text-text-primary"
                      }`}
                    >
                      {isActive && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-accent" />}
                      <span
                        onMouseDown={(event) => startDocumentDrag(event, document.id)}
                        title={canEdit
                          ? `${publicationStatusLabel(lang, document.publicationStatus)} · ${t(lang, "dragCloudDocument")}`
                          : publicationStatusLabel(lang, document.publicationStatus)}
                        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${publicationIconTone} ${
                          canEdit ? "cursor-grab active:cursor-grabbing" : ""
                        }`}
                      >
                        <PublicationIcon size={14} strokeWidth={isActive ? 2.2 : 1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{document.title}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-normal">
                          <span className={`flex-shrink-0 rounded border px-1 py-px leading-none ${accessTone}`}>
                            {accessLevelLabel(lang, document.accessLevel)}
                          </span>
                          <span className="min-w-0 truncate text-text-muted">{documentTimestamp}</span>
                        </span>
                      </span>
                    </button>
                    {canEdit && (
                      <div
                        data-document-action-menu
                        className={`absolute right-1.5 top-1/2 z-20 -translate-y-1/2 ${
                          documentActionMenuId === document.id ? "block" : "hidden group-hover:block group-focus-within:block"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            if (documentActionMenuId === document.id) {
                              setDocumentActionMenuId(null);
                              return;
                            }
                            documentActionTriggerRef.current = event.currentTarget;
                            setDocumentDetailsId(null);
                            setDocumentActionMenuId(document.id);
                          }}
                          className="rounded-lg bg-bg-primary/80 p-1.5 text-text-muted shadow-sm hover:bg-bg-primary hover:text-accent"
                          title={t(lang, "documentActions")}
                          aria-label={t(lang, "documentActions")}
                          aria-expanded={documentActionMenuId === document.id}
                          aria-haspopup="menu"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredDocuments.length === 0 && (
                <div className="mx-1 mt-2 rounded-xl border border-dashed border-border bg-bg-primary/35 px-3 py-5 text-center">
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent">
                    <FileText size={15} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-text-muted">
                    {t(lang, documents.length === 0 ? "noCloudDocuments" : "noFilteredCloudDocuments")}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center px-3 py-5">
            <div className="w-full rounded-xl border border-dashed border-border bg-bg-primary/35 px-3 py-5 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-accent-light text-accent">
                <Users size={17} />
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-text-muted">{t(lang, "noWorkspaces")}</p>
            </div>
          </div>
        )}

        <div className="grid flex-shrink-0 grid-cols-2 gap-1.5 border-t border-border/70 p-2">
          <button
            type="button"
            onClick={() => openDialog("createWorkspace")}
            className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-[11px] font-medium text-text-secondary hover:border-border hover:bg-bg-primary/60 hover:text-text-primary"
            title={t(lang, "createWorkspace")}
          >
            <Plus size={13} className="flex-shrink-0 text-accent" />
            <span className="truncate">{t(lang, "createWorkspace")}</span>
          </button>
          <button
            type="button"
            onClick={() => openDialog("joinWorkspace")}
            className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-[11px] font-medium text-text-secondary hover:border-border hover:bg-bg-primary/60 hover:text-text-primary"
            title={t(lang, "joinWorkspace")}
          >
            <UserPlus size={13} className="flex-shrink-0 text-accent" />
            <span className="truncate">{t(lang, "joinWorkspace")}</span>
          </button>
        </div>
      </aside>

      {actionDocument && documentActionMenuPosition && createPortal(
        <div
          data-document-action-menu
          role="menu"
          aria-label={t(lang, "documentActions")}
          className="fixed z-[10003] overflow-y-auto rounded-xl border border-border bg-bg-primary p-1.5 text-text-primary shadow-xl shadow-black/20"
          style={{
            left: documentActionMenuPosition.left,
            top: documentActionMenuPosition.top,
            width: documentActionMenuPosition.width,
            maxHeight: documentActionMenuPosition.maxHeight,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setDocumentActionMenuId(null);
              openRenameDialog({ id: actionDocument.id, title: actionDocument.title });
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
          >
            <Pencil size={13} />
            {t(lang, "renameCloudDocument")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDocumentPublication(actionDocument.id)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
          >
            <CalendarClock size={13} />
            {t(lang, "scheduleCloudDocument")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openDocumentDetails(actionDocument.id)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-accent"
          >
            <Info size={13} />
            {t(lang, "documentDetails")}
          </button>
          <div className="my-1 border-t border-border/70" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setDocumentActionMenuId(null);
              requestDelete({ kind: "document", id: actionDocument.id, title: actionDocument.title });
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 size={13} />
            {t(lang, "deleteCloudDocument")}
          </button>
        </div>,
        document.body,
      )}

      {detailedDocument && documentDetailsPosition && createPortal(
        <div
          data-document-details
          role="dialog"
          aria-label={t(lang, "documentDetails")}
          className="fixed z-[10002] overflow-y-auto rounded-xl border border-border bg-bg-primary text-text-primary shadow-2xl shadow-black/20"
          style={{
            left: documentDetailsPosition.left,
            top: documentDetailsPosition.top,
            width: documentDetailsPosition.width,
            maxHeight: documentDetailsPosition.maxHeight,
          }}
        >
          <div className="flex items-center gap-2.5 border-b border-border bg-bg-sidebar/45 px-4 py-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
              <Info size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-text-primary">{t(lang, "documentDetails")}</h3>
              <p className="mt-0.5 truncate text-[11px] text-text-muted">{detailedDocument.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setDocumentDetailsId(null)}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              aria-label={t(lang, "close")}
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-xs">
            {[
              [t(lang, "cloudDocumentName"), detailedDocument.title],
              [t(lang, "documentCreator"), detailedDocumentCreator ?? "—"],
              [t(lang, "createdAt"), formatDocumentDate(lang, detailedDocument.createdAt)],
              [t(lang, "updatedAt"), formatDocumentDate(lang, detailedDocument.updatedAt)],
              [t(lang, "publicationStatus"), publicationStatusLabel(lang, detailedDocument.publicationStatus)],
              [t(lang, "collaborationMode"), t(lang, "realTimeCollaboration")],
              [t(lang, "documentAccessLevel"), accessLevelLabel(lang, detailedDocument.accessLevel)],
              ...(detailedDocument.scheduledPublishAt
                ? [[t(lang, "scheduledPublishTime"), formatDocumentDate(lang, detailedDocument.scheduledPublishAt)]]
                : []),
              ...(detailedDocument.publishedAt
                ? [[t(lang, "publishedAt"), formatDocumentDate(lang, detailedDocument.publishedAt)]]
                : []),
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg bg-bg-secondary/55 px-3 py-2.5">
                <div className="text-[10px] font-medium text-text-muted">{label}</div>
                <div className="mt-1 break-words leading-relaxed text-text-primary">{value}</div>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default WorkspaceSidebar;
