import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  FilePlus2,
  FileText,
  LogIn,
  LogOut,
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
import type { WorkspaceInviteRole, WorkspaceRole } from "@/types/workspace";
import { supabase } from "@/utils/supabase";
import { t } from "@/utils/i18n";
import CloudNoteEditor from "@/components/Workspace/CloudNoteEditor";

interface WorkspaceViewProps {
  onOpenAuth: () => void;
}

type ActionDialog = "createWorkspace" | "joinWorkspace" | "newDocument" | null;

function isMissingSchemaError(error: string): boolean {
  return /workspace_members|workspaces|documents|relation .* does not exist|schema cache/i.test(error);
}

export default function WorkspaceView({ onOpenAuth }: WorkspaceViewProps) {
  const lang = useSettingsStore((state) => state.lang);
  const user = useAuthStore((state) => state.user);
  const {
    workspaces,
    documents,
    members,
    activeWorkspaceId,
    activeDocumentId,
    loading,
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
    deleteDocument,
    updateMemberRole,
    removeMember,
  } = useWorkspaceStore();
  const [dialog, setDialog] = useState<ActionDialog>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? null;
  const canEdit = activeWorkspace?.role === "owner" || activeWorkspace?.role === "editor";

  useEffect(() => {
    if (user) {
      void loadWorkspaces(user.id);
    } else {
      reset();
    }
  }, [loadWorkspaces, reset, user]);

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
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [activeWorkspaceId, loadDocuments, loadMembers, loadWorkspaces, user]);

  const roleLabel = (role: WorkspaceRole) => t(
    lang,
    role === "owner" ? "roleOwner" : role === "editor" ? "roleEditor" : "roleViewer",
  );

  const openDialog = (nextDialog: Exclude<ActionDialog, null>) => {
    clearError();
    setDialogValue("");
    setDialog(nextDialog);
  };

  const submitDialog = async () => {
    if (!user || !dialogValue.trim()) return;
    let ok = false;
    if (dialog === "createWorkspace") ok = await createWorkspace(dialogValue, user.id);
    if (dialog === "joinWorkspace") ok = await joinWorkspace(dialogValue, user.id);
    if (dialog === "newDocument") ok = await createDocument(dialogValue, user.id);
    if (ok) setDialog(null);
  };

  const copyInviteCode = async () => {
    if (!activeWorkspace) return;
    await navigator.clipboard.writeText(activeWorkspace.inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm(t(lang, "confirmDeleteCloudDocument"))) return;
    await deleteDocument(documentId);
  };

  const handleLeaveOrDelete = async () => {
    if (!activeWorkspace || !user) return;
    if (activeWorkspace.role === "owner") {
      if (!window.confirm(t(lang, "confirmDeleteWorkspace"))) return;
      if (await deleteWorkspace(activeWorkspace.id, user.id)) setManageOpen(false);
      return;
    }
    if (await leaveWorkspace(activeWorkspace.id, user.id)) setManageOpen(false);
  };

  const dialogTitle = dialog === "createWorkspace"
    ? t(lang, "createWorkspace")
    : dialog === "joinWorkspace"
      ? t(lang, "joinWorkspace")
      : t(lang, "newCloudDocument");
  const dialogPlaceholder = dialog === "joinWorkspace"
    ? t(lang, "inviteCode")
    : dialog === "newDocument"
      ? t(lang, "cloudDocumentName")
      : t(lang, "workspaceName");

  const schemaError = useMemo(() => Boolean(error && isMissingSchemaError(error)), [error]);

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center bg-bg-primary p-6">
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
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary">
      <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-primary px-3">
        <Users size={17} className="flex-shrink-0 text-accent" />
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(event) => void selectWorkspace(event.target.value || null)}
          className="h-8 min-w-0 max-w-[260px] rounded-lg border border-border bg-bg-secondary px-2.5 text-sm font-medium text-text-primary outline-none focus:border-accent"
          aria-label={t(lang, "workspace")}
        >
          {workspaces.length === 0 && <option value="">{t(lang, "workspace")}</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
        {activeWorkspace && (
          <span className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-medium text-accent">
            {roleLabel(activeWorkspace.role)}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => openDialog("createWorkspace")}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <Plus size={13} />{t(lang, "createWorkspace")}
        </button>
        <button
          type="button"
          onClick={() => openDialog("joinWorkspace")}
          className="flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        >
          <UserPlus size={13} />{t(lang, "joinWorkspace")}
        </button>
        {activeWorkspace && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-bg-hover hover:text-accent"
            title={t(lang, "manageWorkspace")}
          >
            <Settings2 size={14} />
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 border-b border-danger/25 bg-danger/5 px-4 py-2 text-xs text-danger">
          <span className="flex-1">{schemaError ? t(lang, "workspaceBackendNotReady") : error}</span>
          <button type="button" onClick={clearError}><X size={13} /></button>
        </div>
      )}

      {loading && workspaces.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          {t(lang, "authWorking")}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center text-text-muted">
            <Users size={28} className="mx-auto mb-3 opacity-60" />
            <p className="text-sm">{t(lang, "noWorkspaces")}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => openDialog("createWorkspace")} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white">
                {t(lang, "createWorkspace")}
              </button>
              <button onClick={() => openDialog("joinWorkspace")} className="rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover">
                {t(lang, "joinWorkspace")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border bg-bg-secondary/30">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-text-secondary">{t(lang, "cloudDocumentName")}</span>
              <button
                type="button"
                onClick={() => openDialog("newDocument")}
                disabled={!canEdit}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-hover hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                title={t(lang, "newCloudDocument")}
              >
                <FilePlus2 size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {documents.map((document) => (
                <div key={document.id} className="group relative mb-1">
                  <button
                    type="button"
                    onClick={() => selectDocument(document.id)}
                    className={`w-full rounded-lg px-3 py-2 pr-9 text-left transition-colors ${
                      document.id === activeDocumentId
                        ? "bg-bg-active text-text-primary"
                        : "text-text-secondary hover:bg-bg-hover"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileText size={13} className="flex-shrink-0 text-accent" />
                      <span className="truncate text-sm font-medium">{document.title}</span>
                    </span>
                    <span className="mt-1 block pl-5 text-[10px] text-text-muted">
                      {new Date(document.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}
                    </span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteDocument(document.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted opacity-0 hover:bg-bg-hover hover:text-danger group-hover:opacity-100"
                      title={t(lang, "deleteNote")}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {documents.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-text-muted">{t(lang, "noCloudDocuments")}</p>
              )}
            </div>
          </aside>

          {activeDocument && activeWorkspace ? (
            <CloudNoteEditor
              key={activeDocument.id}
              document={activeDocument}
              workspaceId={activeWorkspace.id}
              role={activeWorkspace.role}
              user={user}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
              {t(lang, "noCloudDocuments")}
            </div>
          )}
        </div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-bg-primary shadow-2xl" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">{dialogTitle}</h2>
              <button type="button" onClick={() => setDialog(null)} className="rounded p-1 text-text-muted hover:bg-bg-hover"><X size={15} /></button>
            </div>
            <div className="p-4">
              <label className="text-xs font-medium text-text-secondary">{dialogPlaceholder}</label>
              <input
                value={dialogValue}
                onChange={(event) => setDialogValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void submitDialog(); }}
                autoFocus
                className="mt-2 h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
                placeholder={dialogPlaceholder}
              />
              {error && <p className="mt-2 text-xs text-danger">{schemaError ? t(lang, "workspaceBackendNotReady") : error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button onClick={() => setDialog(null)} className="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary hover:bg-bg-hover">{t(lang, "confirmNo")}</button>
              <button onClick={() => void submitDialog()} disabled={!dialogValue.trim() || loading} className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50">{dialogTitle}</button>
            </div>
          </div>
        </div>
      )}

      {manageOpen && activeWorkspace && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-bg-primary shadow-2xl" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{activeWorkspace.name}</h2>
                <p className="mt-0.5 text-xs text-text-muted">{t(lang, "manageWorkspace")}</p>
              </div>
              <button onClick={() => setManageOpen(false)} className="rounded p-1.5 text-text-muted hover:bg-bg-hover"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold text-text-secondary">{t(lang, "shareWorkspace")}</h3>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm font-semibold tracking-wider text-text-primary">{activeWorkspace.inviteCode}</code>
                  <button onClick={() => void copyInviteCode()} className="flex h-9 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover">
                    <Copy size={13} />{copied ? t(lang, "copied") : t(lang, "copyInvite")}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted">{t(lang, "inviteCodeHint")}</p>
                {activeWorkspace.role === "owner" && (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs text-text-secondary">{t(lang, "inviteRole")}</label>
                    <select
                      value={activeWorkspace.inviteRole}
                      onChange={(event) => void updateWorkspace(
                        activeWorkspace.id,
                        { invite_role: event.target.value as WorkspaceInviteRole },
                        user.id,
                      )}
                      className="h-8 rounded-lg border border-border bg-bg-secondary px-2 text-xs text-text-primary"
                    >
                      <option value="editor">{t(lang, "roleEditor")}</option>
                      <option value="viewer">{t(lang, "roleViewer")}</option>
                    </select>
                    <button
                      onClick={() => void regenerateInvite(activeWorkspace.id, user.id)}
                      className="ml-auto flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-secondary hover:bg-bg-hover"
                    >
                      <RefreshCw size={12} />{t(lang, "regenerateInvite")}
                    </button>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold text-text-secondary">{t(lang, "workspaceMembers")} · {members.length}</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  {members.map((member, index) => (
                    <div key={member.userId} className={`flex items-center gap-3 px-3 py-2.5 ${index > 0 ? "border-t border-border" : ""}`}>
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-light text-xs font-semibold text-accent">
                        {member.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{member.displayName}</span>
                      {activeWorkspace.role === "owner" && member.role !== "owner" ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(event) => void updateMemberRole(
                              activeWorkspace.id,
                              member.userId,
                              event.target.value as WorkspaceInviteRole,
                            )}
                            className="h-7 rounded-md border border-border bg-bg-secondary px-1.5 text-[11px] text-text-secondary"
                          >
                            <option value="editor">{t(lang, "roleEditor")}</option>
                            <option value="viewer">{t(lang, "roleViewer")}</option>
                          </select>
                          <button
                            onClick={() => void removeMember(activeWorkspace.id, member.userId)}
                            className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-danger"
                            title={t(lang, "removeMember")}
                          >
                            <UserMinus size={13} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-text-muted">{roleLabel(member.role)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <button
                onClick={() => void handleLeaveOrDelete()}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-danger hover:bg-danger/10"
              >
                {activeWorkspace.role === "owner" ? <Trash2 size={13} /> : <LogOut size={13} />}
                {t(lang, activeWorkspace.role === "owner" ? "deleteWorkspace" : "leaveWorkspace")}
              </button>
              <button onClick={() => setManageOpen(false)} className="h-8 rounded-lg border border-border px-3 text-xs text-text-secondary hover:bg-bg-hover">{t(lang, "close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
