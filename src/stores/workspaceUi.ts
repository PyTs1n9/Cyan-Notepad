import { create } from "zustand";
import { useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * Transient UI state for the workspace view.
 *
 * These values used to live inside `WorkspaceView`, which destructures the
 * whole `workspaceStore` without selectors. Once the sidebar became its own
 * component, every popover toggle there would have re-rendered the entire view
 * (document list, permission modal, editor subtree). Keeping the ephemeral
 * "what is open right now" flags in their own store means only the components
 * that actually draw a given surface subscribe to it.
 *
 * Data ownership stays with `workspaceStore`: nothing here is persisted, and
 * nothing here is derived state that belongs to Supabase.
 */

export type WorkspaceActionDialog =
  | "createWorkspace"
  | "joinWorkspace"
  | "newDocument"
  | "renameDocument"
  | null;

export interface WorkspaceDeleteTarget {
  kind: "document" | "workspace";
  id: string;
  title: string;
}

export type WorkspaceManageSection = "permissions" | "settings";

interface WorkspaceUiState {
  dialog: WorkspaceActionDialog;
  dialogValue: string;
  dialogNotice: string | null;
  renamingDocumentId: string | null;
  deleteTarget: WorkspaceDeleteTarget | null;
  /** Permission / settings modal, opened from the sidebar or the title-bar menu. */
  manageOpen: boolean;
  manageSection: WorkspaceManageSection;
  /** Document whose publication dialog the editor should open next. */
  publicationDocumentId: string | null;
  /** Collaborators currently in the open document's room, published by the editor. */
  onlineCollaborators: number;
  openDialog: (kind: Exclude<WorkspaceActionDialog, null>) => void;
  closeDialog: () => void;
  setDialogValue: (value: string) => void;
  setDialogNotice: (notice: string | null) => void;
  openRenameDialog: (document: { id: string; title: string }) => void;
  requestDelete: (target: WorkspaceDeleteTarget) => void;
  cancelDelete: () => void;
  openManage: (section: WorkspaceManageSection) => void;
  setManageSection: (section: WorkspaceManageSection) => void;
  closeManage: () => void;
  requestPublicationDialog: (documentId: string) => void;
  clearPublicationDialog: () => void;
  setOnlineCollaborators: (count: number) => void;
}

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  dialog: null,
  dialogValue: "",
  dialogNotice: null,
  renamingDocumentId: null,
  deleteTarget: null,
  manageOpen: false,
  manageSection: "permissions",
  publicationDocumentId: null,
  onlineCollaborators: 0,

  openDialog: (kind) => {
    // The dialog prints the workspace error inline, so an error left over from
    // a previous attempt would appear inside a freshly opened, empty form.
    useWorkspaceStore.getState().clearError();
    set({ dialog: kind, dialogValue: "", dialogNotice: null, renamingDocumentId: null });
  },

  closeDialog: () => {
    set({ dialog: null, renamingDocumentId: null, dialogNotice: null });
  },

  setDialogValue: (value) => set({ dialogValue: value }),

  setDialogNotice: (notice) => set({ dialogNotice: notice }),

  openRenameDialog: ({ id, title }) => {
    useWorkspaceStore.getState().clearError();
    set({
      dialog: "renameDocument",
      dialogValue: title,
      dialogNotice: null,
      renamingDocumentId: id,
    });
  },

  requestDelete: (target) => set({ deleteTarget: target }),

  cancelDelete: () => set({ deleteTarget: null }),

  openManage: (section) => set({ manageOpen: true, manageSection: section }),

  setManageSection: (section) => set({ manageSection: section }),

  closeManage: () => set({ manageOpen: false }),

  requestPublicationDialog: (documentId) => set({ publicationDocumentId: documentId }),

  clearPublicationDialog: () => set({ publicationDocumentId: null }),

  setOnlineCollaborators: (count) => set({ onlineCollaborators: count }),
}));
