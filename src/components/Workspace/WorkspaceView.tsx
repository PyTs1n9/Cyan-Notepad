import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  ChevronDown,
  FilePlus2,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  WorkspaceDocumentPublicationStatus,
  WorkspaceInviteRole,
  WorkspaceRole,
} from "@/types/workspace";
import { supabase } from "@/utils/supabase";
import { t } from "@/utils/i18n";
import { PORTAL_ACTION_EVENT, type PortalAction } from "@/utils/portalActions";
import LoadingText from "@/components/LoadingText";
import SidebarResizeHandle from "@/components/Layout/SidebarResizeHandle";
import UserAvatar from "@/components/UserAvatar";

interface WorkspaceViewProps {
  sidebarCollapsed: boolean;
  onSidebarResizeStart: () => void;
  onOpenAuth: () => void;
}

type ActionDialog = "createWorkspace" | "joinWorkspace" | "newDocument" | "renameDocument" | null;

type DeleteConfirmation =
  | { kind: "document"; id: string; title: string }
  | { kind: "workspace"; id: string; title: string }
  | null;

interface MemberRemovalConfirmation {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  displayName: string;
}

const CloudNoteEditor = lazy(() => import("@/components/Workspace/CloudNoteEditor"));

interface WorkspaceDropdownOption {
  value: string;
  label: string;
}

interface WorkspaceDropdownProps {
  value: string;
  options: WorkspaceDropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  containerClassName?: string;
  triggerClassName?: string;
}

interface WorkspaceDropdownMenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

function WorkspaceDropdown({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  containerClassName = "",
  triggerClassName = "h-8 min-w-[96px]",
}: WorkspaceDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<WorkspaceDropdownMenuPosition | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? placeholder ?? "";

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dropdownRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || disabled) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = dropdownRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const menuGap = 4;
      const maxMenuHeight = 224;
      const estimatedMenuHeight = Math.min(maxMenuHeight, Math.max(40, options.length * 32 + 8));
      const spaceBelow = window.innerHeight - rect.bottom - menuGap - viewportPadding;
      const spaceAbove = rect.top - menuGap - viewportPadding;
      const openAbove = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(40, Math.min(maxMenuHeight, openAbove ? spaceAbove : spaceBelow));
      const width = rect.width;
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - viewportPadding - width),
      );

      setMenuPosition({
        left,
        width,
        maxHeight,
        ...(openAbove
          ? { bottom: Math.max(viewportPadding, window.innerHeight - rect.top + menuGap) }
          : { top: Math.min(window.innerHeight - viewportPadding - maxHeight, rect.bottom + menuGap) }),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [disabled, open, options.length]);

  return (
    <div ref={dropdownRef} className={`relative min-w-0 ${containerClassName}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled) {
            event.preventDefault();
            setOpen((current) => !current);
          }
          if (event.key === "ArrowDown" && !disabled) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-bg-secondary px-2.5 text-left text-text-primary
          outline-none transition-colors hover:bg-bg-hover focus:border-accent focus:ring-1 focus:ring-accent
          disabled:cursor-not-allowed disabled:opacity-60 ${triggerClassName}`}
      >
        <span className="min-w-0 truncate text-inherit">{selectedLabel}</span>
        <ChevronDown
          size={13}
          className={`flex-shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          className="fixed z-[10001] overflow-y-auto rounded-lg border border-border bg-bg-primary p-1 text-text-primary shadow-lg shadow-black/15"
          style={{
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            ...(menuPosition.top !== undefined
              ? { top: menuPosition.top }
              : { bottom: menuPosition.bottom }),
          }}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-xs transition-colors
                  ${selected
                    ? "bg-accent-light text-accent"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
              >
                {option.label}
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="px-2.5 py-1.5 text-xs text-text-muted">{placeholder}</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function isMissingSchemaError(error: string): boolean {
  return /workspace_members|workspaces|documents|relation .* does not exist|schema cache/i.test(error);
}

export default function WorkspaceView({
  sidebarCollapsed,
  onSidebarResizeStart,
  onOpenAuth,
}: WorkspaceViewProps) {
  const lang = useSettingsStore((state) => state.lang);
  const user = useAuthStore((state) => state.user);
  const {
    workspaces,
    documents,
    members,
    activeWorkspaceId,
    activeDocumentId,
    loading,
    creatingDocument,
    error,
    reset,
    clearError,
    loadWorkspaces,
    selectWorkspace,
    loadDocuments,
    loadMembers,
    selectDocument,
    createWorkspace,
    joinWorkspace,
    leaveWorkspace,
    deleteWorkspace,
    updateWorkspace,
    regenerateInvite,
    createDocument,
    updateDocumentTitle,
    setDocumentPublication,
    deleteDocument,
    updateMemberRole,
    removeMember,
  } = useWorkspaceStore();
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogNotice, setDialogNotice] = useState<string | null>(null);
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
  const [submittingDialog, setSubmittingDialog] = useState(false);
  const submittingDialogRef = useRef(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>(null);
  const [deleting, setDeleting] = useState(false);
  const [memberRemovalConfirmation, setMemberRemovalConfirmation] = useState<MemberRemovalConfirmation | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [leavingWorkspace, setLeavingWorkspace] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [savingWorkspaceName, setSavingWorkspaceName] = useState(false);
  const [copied, setCopied] = useState(false);
  const publishingDueDocumentIdsRef = useRef(new Set<string>());

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? null;
  const canEdit = activeWorkspace?.role === "owner" || activeWorkspace?.role === "editor";
  const userMetadata = user?.user_metadata as Record<string, unknown> | undefined;
  const currentDisplayName = typeof userMetadata?.display_name === "string" && userMetadata.display_name.trim()
    ? userMetadata.display_name.trim()
    : null;
  const currentAvatarUrl = typeof userMetadata?.avatar_url === "string" || userMetadata?.avatar_url === null
    ? userMetadata.avatar_url
    : undefined;
  const displayedMembers = members.map((member) => member.userId === user?.id
    ? {
        ...member,
        displayName: currentDisplayName ?? member.displayName,
        avatarUrl: currentAvatarUrl !== undefined ? currentAvatarUrl : member.avatarUrl,
      }
    : member);

  useEffect(() => {
    if (user) {
      void loadWorkspaces(user.id);
    } else {
      reset();
    }
  }, [loadWorkspaces, reset, user]);

  useEffect(() => {
    if (manageOpen && activeWorkspaceId) {
      void loadMembers(activeWorkspaceId);
    }
  }, [activeWorkspaceId, loadMembers, manageOpen]);

  useEffect(() => {
    if (manageOpen && activeWorkspace) {
      setWorkspaceNameDraft(activeWorkspace.name);
    }
  }, [activeWorkspace?.id, activeWorkspace?.name, manageOpen]);

  useEffect(() => {
    const client = supabase;
    if (!client || !activeWorkspaceId || !user) return;
    const channel = client
      .channel(`workspace-meta-${activeWorkspaceId}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => { void loadDocuments(activeWorkspaceId); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${activeWorkspaceId}` },
        () => {
          void loadMembers(activeWorkspaceId);
          void loadWorkspaces(user.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${activeWorkspaceId}` },
        () => { void loadWorkspaces(user.id); },
      )
      .on(
        "postgres_changes",
        // Profile rows hold the display name and avatar used by every member.
        // Listen to the full row lifecycle so a newly-created profile is also
        // picked up without requiring the user to reopen the workspace.
        { event: "*", schema: "public", table: "profiles" },
        () => { void loadMembers(activeWorkspaceId); },
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [activeWorkspaceId, loadDocuments, loadMembers, loadWorkspaces, user]);

  useEffect(() => {
    if (!activeWorkspaceId || !canEdit) return;
    let cancelled = false;
    let timerId: number | null = null;

    const scheduleNextPublication = () => {
      if (cancelled) return;
      const state = useWorkspaceStore.getState();
      if (state.activeWorkspaceId !== activeWorkspaceId) return;

      const scheduledDocuments = state.documents.flatMap((workspaceDocument) => {
        if (workspaceDocument.publicationStatus !== "scheduled" || !workspaceDocument.scheduledPublishAt) return [];
        const scheduledAt = Date.parse(workspaceDocument.scheduledPublishAt);
        return Number.isFinite(scheduledAt) ? [{ id: workspaceDocument.id, scheduledAt }] : [];
      });
      if (scheduledDocuments.length === 0) return;

      const now = Date.now();
      const dueDocuments = scheduledDocuments.filter(({ scheduledAt }) => scheduledAt <= now);
      const publishableDocuments = dueDocuments.filter(({ id }) => !publishingDueDocumentIdsRef.current.has(id));

      if (publishableDocuments.length > 0) {
        void Promise.all(publishableDocuments.map(async ({ id }) => {
          publishingDueDocumentIdsRef.current.add(id);
          try {
            await setDocumentPublication(id, "publish_now");
          } finally {
            publishingDueDocumentIdsRef.current.delete(id);
          }
        })).finally(() => {
          if (!cancelled) timerId = window.setTimeout(scheduleNextPublication, 5_000);
        });
        return;
      }

      if (dueDocuments.length > 0) {
        timerId = window.setTimeout(scheduleNextPublication, 250);
        return;
      }

      const nextScheduledAt = Math.min(...scheduledDocuments.map(({ scheduledAt }) => scheduledAt));
      const maximumTimerDelay = 2_147_000_000;
      const delay = Math.min(maximumTimerDelay, Math.max(25, nextScheduledAt - now + 25));
      timerId = window.setTimeout(scheduleNextPublication, delay);
    };

    scheduleNextPublication();
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [activeWorkspaceId, canEdit, documents, setDocumentPublication]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const refreshVisibleDocuments = () => {
      if (document.visibilityState === "visible") void loadDocuments(activeWorkspaceId);
    };
    const intervalId = window.setInterval(refreshVisibleDocuments, 60_000);
    document.addEventListener("visibilitychange", refreshVisibleDocuments);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshVisibleDocuments);
    };
  }, [activeWorkspaceId, loadDocuments]);

  const roleLabel = (role: WorkspaceRole) => t(
    lang,
    role === "owner" ? "roleOwner" : role === "editor" ? "roleEditor" : "roleViewer",
  );
  const publicationLabel = (status: WorkspaceDocumentPublicationStatus) => t(
    lang,
    status === "draft"
      ? "cloudDocumentDraft"
      : status === "scheduled"
        ? "cloudDocumentScheduled"
        : "cloudDocumentPublished",
  );

  const openDialog = (nextDialog: Exclude<ActionDialog, null>) => {
    clearError();
    setDialogValue("");
    setDialogNotice(null);
    setRenamingDocumentId(null);
    setDialog(nextDialog);
  };

  useEffect(() => {
    const handlePortalAction = (event: Event) => {
      const action = (event as CustomEvent<PortalAction>).detail;
      const nextDialog = action === "create-workspace"
        ? "createWorkspace"
        : action === "join-workspace"
          ? "joinWorkspace"
          : action === "new-cloud-document" && canEdit
            ? "newDocument"
            : null;
      if (!nextDialog) return;
      openDialog(nextDialog);
    };
    window.addEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
    return () => window.removeEventListener(PORTAL_ACTION_EVENT, handlePortalAction);
  }, [canEdit]);

  const openRenameDocumentDialog = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    clearError();
    setDialogValue(document.title);
    setDialogNotice(null);
    setRenamingDocumentId(document.id);
    setDialog("renameDocument");
  };

  const submitDialog = async () => {
    if (!user || !dialogValue.trim() || submittingDialogRef.current) return;
    submittingDialogRef.current = true;
    setSubmittingDialog(true);
    setDialogNotice(null);
    try {
      let ok = false;
      if (dialog === "createWorkspace") ok = await createWorkspace(dialogValue, user.id);
      if (dialog === "joinWorkspace") {
        const result = await joinWorkspace(dialogValue, user.id);
        if (result === "alreadyJoined") {
          setDialogNotice(t(lang, "workspaceAlreadyJoined"));
          return;
        }
        ok = result === "joined";
      }
      if (dialog === "newDocument") ok = await createDocument(dialogValue, user.id);
      if (dialog === "renameDocument" && renamingDocumentId) {
        ok = await updateDocumentTitle(renamingDocumentId, dialogValue.trim());
      }
      if (ok) {
        setDialog(null);
        setRenamingDocumentId(null);
      }
    } finally {
      submittingDialogRef.current = false;
      setSubmittingDialog(false);
    }
  };

  const copyInviteCode = async () => {
    if (!activeWorkspace) return;
    await navigator.clipboard.writeText(activeWorkspace.inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const saveWorkspaceName = async () => {
    if (!activeWorkspace || !user || activeWorkspace.role !== "owner" || savingWorkspaceName) return;
    const nextName = workspaceNameDraft.trim();
    if (!nextName || nextName === activeWorkspace.name) {
      setWorkspaceNameDraft(activeWorkspace.name);
      return;
    }

    setSavingWorkspaceName(true);
    try {
      const ok = await updateWorkspace(activeWorkspace.id, { name: nextName }, user.id);
      if (ok) setWorkspaceNameDraft(nextName);
    } finally {
      setSavingWorkspaceName(false);
    }
  };

  const handleDeleteDocument = (documentId: string) => {
    const document = documents.find((item) => item.id === documentId);
    if (!document) return;
    setDeleteConfirmation({ kind: "document", id: document.id, title: document.title });
  };

  const handleRemoveMember = (memberUserId: string, displayName: string) => {
    if (!activeWorkspace) return;
    setMemberRemovalConfirmation({
      workspaceId: activeWorkspace.id,
      workspaceName: activeWorkspace.name,
      userId: memberUserId,
      displayName,
    });
  };

  const confirmRemoveMember = async () => {
    if (!memberRemovalConfirmation || removingMember) return;
    setRemovingMember(true);
    try {
      const removed = await removeMember(
        memberRemovalConfirmation.workspaceId,
        memberRemovalConfirmation.userId,
      );
      if (removed) setMemberRemovalConfirmation(null);
    } finally {
      setRemovingMember(false);
    }
  };

  const handleLeaveOrDelete = async () => {
    if (!activeWorkspace || !user || leavingWorkspace) return;
    if (activeWorkspace.role === "owner") {
      setDeleteConfirmation({ kind: "workspace", id: activeWorkspace.id, title: activeWorkspace.name });
      return;
    }
    setLeavingWorkspace(true);
    try {
      if (await leaveWorkspace(activeWorkspace.id, user.id)) setManageOpen(false);
    } finally {
      setLeavingWorkspace(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation || deleting) return;
    const pendingDelete = deleteConfirmation;
    setDeleting(true);
    try {
      const ok = pendingDelete.kind === "document"
        ? await deleteDocument(pendingDelete.id)
        : user
          ? await deleteWorkspace(pendingDelete.id, user.id)
          : false;
      if (ok) {
        setDeleteConfirmation(null);
        if (pendingDelete.kind === "workspace") setManageOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const dialogTitle = dialog === "createWorkspace"
    ? t(lang, "createWorkspace")
    : dialog === "joinWorkspace"
      ? t(lang, "joinWorkspace")
      : dialog === "renameDocument"
        ? t(lang, "renameCloudDocument")
        : t(lang, "newCloudDocument");
  const dialogPlaceholder = dialog === "joinWorkspace"
    ? t(lang, "inviteCode")
    : dialog === "newDocument" || dialog === "renameDocument"
      ? t(lang, "cloudDocumentName")
      : t(lang, "workspaceName");
  const isDialogSubmitting = submittingDialog || (dialog === "newDocument" && creatingDocument);
  const DialogIcon = dialog === "joinWorkspace"
    ? UserPlus
    : dialog === "newDocument"
      ? FilePlus2
      : dialog === "renameDocument"
        ? Pencil
        : Plus;

  const schemaError = useMemo(() => Boolean(error && isMissingSchemaError(error)), [error]);

  const renderWorkspaceSelector = () => (
    <div className="rounded-xl border border-border bg-bg-primary/65 p-2 shadow-sm shadow-black/[0.03]">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {t(lang, "workspaceName")}
        </span>
        {activeWorkspace && (
          <span className="flex-shrink-0 rounded-full border border-accent/15 bg-accent-light px-2 py-0.5 text-[10px] font-semibold text-accent">
            {roleLabel(activeWorkspace.role)}
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
            onClick={() => setManageOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-bg-secondary text-text-muted transition-colors hover:border-accent/30 hover:bg-bg-hover hover:text-accent"
            title={t(lang, "manageWorkspace")}
            aria-label={t(lang, "manageWorkspace")}
          >
            <Settings2 size={15} />
          </button>
        )}
      </div>
    </div>
  );

  if (!user) {
    return (
      <div className="workspace-surface app-interactive-surface flex flex-1 items-center justify-center bg-bg-primary p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-bg-secondary/40 p-7 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent-light text-accent">
            <Users size={23} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-text-primary">{t(lang, "workspaceLoginRequired")}</h1>
          <p className="mt-2 text-sm text-text-muted">{t(lang, "workspaceLoginHint")}</p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mx-auto mt-5 flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <LogIn size={15} />
            {t(lang, "authSignIn")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-surface app-interactive-surface flex min-h-0 flex-1 bg-bg-primary">
      <div
        style={{ width: sidebarCollapsed ? 0 : "var(--workspace-sidebar-width)" }}
        className="sidebar-width-shell h-full flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
      >
        <aside
          className="flex h-full flex-shrink-0 flex-col bg-bg-sidebar"
          style={{ width: "var(--workspace-sidebar-width)" }}
        >
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
            {renderWorkspaceSelector()}
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

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {documents.map((document) => {
                  const isActive = document.id === activeDocumentId;
                  const publicationTone = document.publicationStatus === "draft"
                    ? "border-border bg-bg-secondary text-text-muted"
                    : document.publicationStatus === "scheduled"
                      ? "border-warning/20 bg-warning/10 text-warning"
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
                    <div key={document.id} className="group relative mb-1 rounded-xl">
                      <button
                        type="button"
                        data-flat-row-button
                        onClick={() => selectDocument(document.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`relative flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-xl border py-2 pl-2.5 text-left transition-colors ${canEdit ? "pr-16" : "pr-2.5"} ${
                          isActive
                            ? "flat-active-row border-accent/20 text-text-primary"
                            : "border-transparent text-text-secondary hover:border-border hover:bg-bg-primary/55 hover:text-text-primary"
                        }`}
                      >
                        {isActive && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-accent" />}
                        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                          isActive ? "bg-accent text-white" : "bg-bg-primary/70 text-text-muted"
                        }`}>
                          <FileText size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{document.title}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] font-normal">
                            <span className={`flex-shrink-0 rounded border px-1 py-px leading-none ${publicationTone}`}>
                              {publicationLabel(document.publicationStatus)}
                            </span>
                            <span className="min-w-0 truncate text-text-muted">{documentTimestamp}</span>
                          </span>
                        </span>
                      </button>
                      {canEdit && (
                        <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                          <button
                            type="button"
                            onClick={() => openRenameDocumentDialog(document.id)}
                            className="rounded-lg bg-bg-primary/80 p-1.5 text-text-muted shadow-sm hover:bg-bg-primary hover:text-accent"
                            title={t(lang, "renameCloudDocument")}
                            aria-label={t(lang, "renameCloudDocument")}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(document.id)}
                            className="rounded-lg bg-bg-primary/80 p-1.5 text-text-muted shadow-sm hover:bg-bg-primary hover:text-danger"
                            title={t(lang, "deleteNote")}
                            aria-label={t(lang, "deleteNote")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {documents.length === 0 && (
                  <div className="mx-1 mt-2 rounded-xl border border-dashed border-border bg-bg-primary/35 px-3 py-5 text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent">
                      <FileText size={15} />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-text-muted">{t(lang, "noCloudDocuments")}</p>
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
      </div>
      {!sidebarCollapsed && (
        <SidebarResizeHandle onPointerDown={onSidebarResizeStart} />
      )}

      <section className="app-work-area-overlay flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {error && (
        <div className="flex items-start gap-2 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs text-danger">
          <span className="flex-1">{schemaError ? t(lang, "workspaceBackendNotReady") : error}</span>
          <button type="button" onClick={clearError}><X size={13} /></button>
        </div>
      )}

      {loading && workspaces.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          <LoadingText label={t(lang, "authWorking")} />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center text-text-muted">
            <Users size={28} className="mx-auto mb-3 opacity-60" />
            <p className="text-sm">{t(lang, "noWorkspaces")}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => openDialog("createWorkspace")}
                className="flat-create-trigger group flex min-h-12 w-44 items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary hover:border-accent/40 hover:bg-bg-hover/45"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-transform duration-200 group-hover:rotate-90">
                  <Plus size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-tight">{t(lang, "createWorkspace")}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">{t(lang, "workspaceName")}</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-45" />
              </button>
              <button
                onClick={() => openDialog("joinWorkspace")}
                className="flat-create-trigger group flex min-h-12 w-44 items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary hover:border-accent/40 hover:bg-bg-hover/45"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-transform duration-200 group-hover:scale-105">
                  <UserPlus size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-tight">{t(lang, "joinWorkspace")}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">{t(lang, "inviteCode")}</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-45" />
              </button>
            </div>
          </div>
        </div>
      ) : activeDocument && activeWorkspace ? (
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
              <LoadingText label={t(lang, "authWorking")} />
            </div>
          }
        >
          <CloudNoteEditor
            key={activeDocument.id}
            document={activeDocument}
            workspaceId={activeWorkspace.id}
            role={activeWorkspace.role}
            user={user}
          />
        </Suspense>
      ) : activeWorkspace ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm text-center text-text-muted">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-bg-secondary/70 text-accent">
              <FileText size={23} />
            </div>
            <p className="mt-4 text-sm font-medium text-text-primary">{t(lang, "noCloudDocuments")}</p>
            {canEdit ? (
              <button
                type="button"
                onClick={() => openDialog("newDocument")}
                disabled={creatingDocument}
                className="flat-create-trigger group mx-auto mt-4 flex min-h-12 w-52 items-center gap-2.5 rounded-xl border border-border px-2.5 text-left text-sm font-medium text-text-primary hover:border-accent/40 hover:bg-bg-hover/45 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent transition-transform duration-200 group-hover:scale-105">
                  <FilePlus2 size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{t(lang, "newCloudDocument")}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">{t(lang, "cloudDocumentName")}</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-accent opacity-45" />
              </button>
            ) : (
              <p className="mx-auto mt-3 max-w-xs rounded-lg bg-bg-secondary/65 px-3 py-2 text-xs leading-relaxed text-text-muted">
                {t(lang, "noCloudDocumentsReadOnly")}
              </p>
            )}
          </div>
        </div>
      ) : null}
      </section>

      {dialog && (
        <div className="app-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
          <div className="app-modal-panel w-full max-w-sm overflow-hidden rounded-xl border border-border bg-bg-primary shadow-2xl" role="dialog" aria-modal="true">
            <div className="flex items-center gap-2.5 border-b border-border bg-bg-sidebar/45 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent">
                <DialogIcon size={16} />
              </span>
              <h2 className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{dialogTitle}</h2>
              <button type="button" onClick={() => setDialog(null)} className="rounded-lg p-1.5 text-text-muted hover:bg-bg-hover"><X size={15} /></button>
            </div>
            <div className="p-4">
              <label className="text-xs font-medium text-text-secondary">{dialogPlaceholder}</label>
              <input
                value={dialogValue}
                onChange={(event) => {
                  setDialogValue(event.target.value);
                  setDialogNotice(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitDialog();
                  }
                }}
                disabled={submittingDialog}
                autoFocus
                className="mt-2 h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
                placeholder={dialogPlaceholder}
              />
              {dialogNotice && <p className="mt-2 text-xs text-accent">{dialogNotice}</p>}
              {error && <p className="mt-2 text-xs text-danger">{schemaError ? t(lang, "workspaceBackendNotReady") : error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button onClick={() => setDialog(null)} className="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary hover:bg-bg-hover">{t(lang, "confirmNo")}</button>
              <button
                onClick={() => void submitDialog()}
                disabled={!dialogValue.trim() || loading || submittingDialog || (dialog === "newDocument" && creatingDocument)}
                aria-busy={submittingDialog || (dialog === "newDocument" && creatingDocument)}
                className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDialogSubmitting
                  ? <LoadingText label={dialogTitle} variant="bounce" />
                  : dialogTitle}
              </button>
            </div>
          </div>
        </div>
      )}

      {manageOpen && activeWorkspace && (
        <div className="app-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-[2px]">
          <div
            className="app-modal-panel flex max-h-[min(760px,88vh)] w-full max-w-xl flex-col overflow-hidden rounded-[22px] border border-border bg-bg-primary shadow-2xl shadow-black/20"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-manage-title"
          >
            <div className="flex items-start gap-3 border-b border-border bg-bg-sidebar/45 px-5 py-5 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="workspace-manage-title" className="truncate text-base font-semibold text-text-primary">
                    {activeWorkspace.name}
                  </h2>
                  <span className="rounded-full bg-accent-light px-2.5 py-1 text-[11px] font-semibold text-accent">
                    {roleLabel(activeWorkspace.role)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-muted">{t(lang, "manageWorkspace")}</p>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-xl p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                aria-label={t(lang, "close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
              {activeWorkspace.role === "owner" && (
                <section className="border-b border-border py-5">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">{t(lang, "renameWorkspace")}</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{t(lang, "workspaceNameHint")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={workspaceNameDraft}
                      onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveWorkspaceName();
                        }
                      }}
                      maxLength={80}
                      disabled={savingWorkspaceName}
                      aria-label={t(lang, "workspaceName")}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void saveWorkspaceName()}
                      disabled={savingWorkspaceName || !workspaceNameDraft.trim() || workspaceNameDraft.trim() === activeWorkspace.name}
                      className="flex h-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingWorkspaceName
                        ? <LoadingText label={t(lang, "authWorking")} variant="bounce" />
                        : t(lang, "saveWorkspaceName")}
                    </button>
                  </div>
                </section>
              )}

              <section className="border-b border-border py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{t(lang, "shareWorkspace")}</h3>
                  </div>
                  <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
                    <code className="hidden rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm font-semibold tracking-[0.16em] text-text-primary sm:block">
                      {activeWorkspace.inviteCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyInviteCode()}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                    >
                      <Copy size={13} />
                      <span>{copied ? t(lang, "copied") : t(lang, "copyInvite")}</span>
                    </button>
                    {activeWorkspace.role === "owner" && (
                      <button
                        type="button"
                        onClick={() => void regenerateInvite(activeWorkspace.id, user.id)}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      >
                        <RefreshCw size={12} />
                        <span>{t(lang, "regenerateInvite")}</span>
                      </button>
                    )}
                  </div>
                </div>
                <code className="mt-3 block rounded-lg border border-border bg-bg-secondary px-3 py-2 text-center text-sm font-semibold tracking-[0.2em] text-text-primary sm:hidden">
                  {activeWorkspace.inviteCode}
                </code>
                {activeWorkspace.role === "owner" && (
                  <div className="mt-4 space-y-2.5 border-t border-border/70 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-text-secondary">{t(lang, "inviteRole")}</label>
                      <WorkspaceDropdown
                        value={activeWorkspace.inviteRole}
                        options={[
                          { value: "editor", label: t(lang, "roleEditor") },
                          { value: "viewer", label: t(lang, "roleViewer") },
                        ]}
                        onChange={(value) => void updateWorkspace(
                          activeWorkspace.id,
                          { invite_role: value as WorkspaceInviteRole },
                          user.id,
                        )}
                        ariaLabel={t(lang, "inviteRole")}
                        triggerClassName="h-8 min-w-[92px] text-xs"
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="py-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">{t(lang, "workspaceMembers")}</h3>
                  <span className="rounded-full bg-bg-secondary px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                    {displayedMembers.length}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
                  {displayedMembers.map((member, index) => (
                    <div key={member.userId} className={`flex items-center gap-2.5 px-3 py-2.5 ${index > 0 ? "border-t border-border" : ""}`}>
                      <UserAvatar
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        className="h-8 w-8 bg-accent-light text-xs font-semibold text-accent"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{member.displayName}</span>
                      {activeWorkspace.role === "owner" && member.role !== "owner" ? (
                        <>
                          <WorkspaceDropdown
                            value={member.role}
                            options={[
                              { value: "editor", label: t(lang, "roleEditor") },
                              { value: "viewer", label: t(lang, "roleViewer") },
                            ]}
                            onChange={(value) => void updateMemberRole(
                              activeWorkspace.id,
                              member.userId,
                              value as WorkspaceInviteRole,
                            )}
                            ariaLabel={member.displayName}
                            triggerClassName="h-7 min-w-[80px] px-2 text-[11px] text-text-secondary"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.userId, member.displayName)}
                            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                            title={t(lang, "removeMember")}
                            aria-label={t(lang, "removeMember")}
                          >
                            <UserMinus size={13} />
                          </button>
                        </>
                      ) : (
                        <span className="shrink-0 rounded-full bg-bg-secondary px-2 py-1 text-[11px] font-semibold text-text-muted">
                          {roleLabel(member.role)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button
                type="button"
                onClick={() => void handleLeaveOrDelete()}
                disabled={leavingWorkspace}
                aria-busy={leavingWorkspace}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-danger transition-colors hover:bg-danger/10 sm:justify-start"
              >
                {leavingWorkspace ? (
                  <LoadingText label={t(lang, "leaveWorkspace")} variant="bounce" />
                ) : (
                  <>
                    {activeWorkspace.role === "owner" ? <Trash2 size={13} /> : <LogOut size={13} />}
                    {t(lang, activeWorkspace.role === "owner" ? "deleteWorkspace" : "leaveWorkspace")}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                {t(lang, "close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmation && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[10002] flex items-center justify-center px-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))" }}
        >
          <div
            className="app-modal-panel w-full max-w-[320px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-delete-confirm-title"
          >
            <div className="px-4 pb-3 pt-4">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <Trash2 size={16} />
                </div>
                <div className="min-w-0">
                  <div id="workspace-delete-confirm-title" className="text-sm font-semibold">
                    {t(lang, deleteConfirmation.kind === "workspace" ? "deleteWorkspace" : "deleteNote")}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-muted">
                    {deleteConfirmation.title}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                {t(
                  lang,
                  deleteConfirmation.kind === "workspace"
                    ? "confirmDeleteWorkspace"
                    : "confirmDeleteCloudDocument",
                ).replace(
                  deleteConfirmation.kind === "workspace" ? "{workspace}" : "{document}",
                  deleteConfirmation.title,
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                disabled={deleting}
                className="h-8 cursor-pointer rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                aria-busy={deleting}
                className="h-8 cursor-pointer rounded-lg bg-danger px-3 text-sm text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting
                  ? <LoadingText label={t(lang, "confirmYes")} variant="bounce" />
                  : t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {memberRemovalConfirmation && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[10003] flex items-center justify-center px-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))" }}
        >
          <div
            className="app-modal-panel w-full max-w-[340px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-remove-member-confirm-title"
          >
            <div className="px-4 pb-3 pt-4">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <UserMinus size={16} />
                </div>
                <div className="min-w-0">
                  <div id="workspace-remove-member-confirm-title" className="text-sm font-semibold">
                    {t(lang, "removeMember")}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-muted">
                    {memberRemovalConfirmation.displayName}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                {t(lang, "confirmRemoveMember")
                  .replace("{member}", memberRemovalConfirmation.displayName)
                  .replace("{workspace}", memberRemovalConfirmation.workspaceName)}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setMemberRemovalConfirmation(null)}
                disabled={removingMember}
                className="h-8 cursor-pointer rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                type="button"
                onClick={() => void confirmRemoveMember()}
                disabled={removingMember}
                aria-busy={removingMember}
                className="h-8 cursor-pointer rounded-lg bg-danger px-3 text-sm text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingMember
                  ? <LoadingText label={t(lang, "confirmYes")} variant="bounce" />
                  : t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
