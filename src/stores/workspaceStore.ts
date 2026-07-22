import { create } from "zustand";
import type {
  Workspace,
  WorkspaceDocument,
  WorkspaceDocumentAccessLevel,
  WorkspaceDocumentPublicationAction,
  WorkspaceInviteRole,
  WorkspaceMember,
} from "@/types/workspace";
import * as workspaceApi from "@/utils/workspaceApi";

interface WorkspaceState {
  workspaces: Workspace[];
  documents: WorkspaceDocument[];
  members: WorkspaceMember[];
  activeWorkspaceId: string | null;
  activeDocumentId: string | null;
  loading: boolean;
  creatingDocument: boolean;
  reorderingDocument: boolean;
  error: string | null;
  reset: () => void;
  clearError: () => void;
  loadWorkspaces: (userId: string) => Promise<void>;
  selectWorkspace: (workspaceId: string | null) => Promise<void>;
  loadDocuments: (workspaceId?: string) => Promise<void>;
  loadMembers: (workspaceId?: string) => Promise<void>;
  selectDocument: (documentId: string | null) => void;
  createWorkspace: (name: string, userId: string) => Promise<boolean>;
  joinWorkspace: (
    inviteCode: string,
    userId: string,
  ) => Promise<"joined" | "alreadyJoined" | false>;
  leaveWorkspace: (workspaceId: string, userId: string) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string, userId: string) => Promise<boolean>;
  updateWorkspace: (
    workspaceId: string,
    updates: { name?: string; invite_role?: WorkspaceInviteRole },
    userId: string,
  ) => Promise<boolean>;
  regenerateInvite: (workspaceId: string, userId: string) => Promise<string | null>;
  createDocument: (title: string, userId: string, content?: string) => Promise<boolean>;
  updateDocumentTitle: (documentId: string, title: string) => Promise<boolean>;
  reorderDocument: (
    documentId: string,
    referenceDocumentId: string,
    position: "before" | "after",
  ) => Promise<boolean>;
  setDocumentPublication: (
    documentId: string,
    action: WorkspaceDocumentPublicationAction,
    scheduledPublishAt?: string,
  ) => Promise<boolean>;
  setDocumentAccessLevel: (
    documentId: string,
    accessLevel: WorkspaceDocumentAccessLevel,
  ) => Promise<boolean>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  updateMemberRole: (
    workspaceId: string,
    userId: string,
    role: WorkspaceInviteRole,
  ) => Promise<boolean>;
  transferWorkspaceOwnership: (
    workspaceId: string,
    nextOwnerId: string,
    userId: string,
  ) => Promise<boolean>;
  removeMember: (workspaceId: string, userId: string) => Promise<boolean>;
}

const initialState = {
  workspaces: [] as Workspace[],
  documents: [] as WorkspaceDocument[],
  members: [] as WorkspaceMember[],
  activeWorkspaceId: null as string | null,
  activeDocumentId: null as string | null,
  loading: false,
  creatingDocument: false,
  reorderingDocument: false,
  error: null as string | null,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return String(error);
}

function reorderDocuments(
  documents: WorkspaceDocument[],
  documentId: string,
  referenceDocumentId: string,
  position: "before" | "after",
): WorkspaceDocument[] {
  const sourceIndex = documents.findIndex((document) => document.id === documentId);
  if (sourceIndex < 0 || !documents.some((document) => document.id === referenceDocumentId)) {
    return documents;
  }

  const nextDocuments = [...documents];
  const [movedDocument] = nextDocuments.splice(sourceIndex, 1);
  const referenceIndex = nextDocuments.findIndex((document) => document.id === referenceDocumentId);
  if (!movedDocument || referenceIndex < 0) return documents;

  nextDocuments.splice(referenceIndex + (position === "after" ? 1 : 0), 0, movedDocument);
  if (nextDocuments.every((document, index) => document.id === documents[index]?.id)) {
    return documents;
  }

  return nextDocuments.map((document, index) => ({
    ...document,
    sortOrder: index * 1024,
  }));
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...initialState,

  reset: () => set(initialState),
  clearError: () => set({ error: null }),

  loadWorkspaces: async (userId) => {
    set({ loading: true, error: null });
    try {
      const workspaces = await workspaceApi.fetchWorkspaces(userId);
      const previousId = get().activeWorkspaceId;
      const nextId = workspaces.some((item) => item.id === previousId)
        ? previousId
        : workspaces[0]?.id ?? null;
      set({ workspaces, activeWorkspaceId: nextId, loading: false });
      if (nextId) {
        // Load member profiles together with the workspace documents so the
        // member list is ready immediately and can stay in sync with realtime
        // profile updates even before the management dialog is opened.
        await Promise.all([
          get().loadDocuments(nextId),
          get().loadMembers(nextId),
        ]);
      } else {
        set({ documents: [], members: [], activeDocumentId: null });
      }
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
    }
  },

  selectWorkspace: async (workspaceId) => {
    set({
      activeWorkspaceId: workspaceId,
      activeDocumentId: null,
      documents: [],
      members: [],
      error: null,
    });
    if (workspaceId) {
      await Promise.all([
        get().loadDocuments(workspaceId),
        get().loadMembers(workspaceId),
      ]);
    }
  },

  loadDocuments: async (workspaceId) => {
    const targetId = workspaceId ?? get().activeWorkspaceId;
    if (!targetId) return;
    try {
      const documents = await workspaceApi.fetchDocuments(targetId);
      if (get().activeWorkspaceId !== targetId) return;
      const previousId = get().activeDocumentId;
      const nextId = documents.some((item) => item.id === previousId)
        ? previousId
        : documents[0]?.id ?? null;
      set({ documents, activeDocumentId: nextId, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  loadMembers: async (workspaceId) => {
    const targetId = workspaceId ?? get().activeWorkspaceId;
    if (!targetId) return;
    try {
      const members = await workspaceApi.fetchMembers(targetId);
      if (get().activeWorkspaceId !== targetId) return;
      set({ members, error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  selectDocument: (documentId) => set({ activeDocumentId: documentId }),

  createWorkspace: async (name, userId) => {
    set({ loading: true, error: null });
    try {
      const workspaceId = await workspaceApi.createWorkspace(name, userId);
      await get().loadWorkspaces(userId);
      await get().selectWorkspace(workspaceId);
      set({ loading: false });
      return true;
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      return false;
    }
  },

  joinWorkspace: async (inviteCode, userId) => {
    set({ loading: true, error: null });
    try {
      const joinedWorkspaceIds = new Set(get().workspaces.map((workspace) => workspace.id));
      const workspaceId = await workspaceApi.joinWorkspace(inviteCode);
      if (joinedWorkspaceIds.has(workspaceId)) {
        set({ loading: false });
        return "alreadyJoined";
      }
      await get().loadWorkspaces(userId);
      await get().selectWorkspace(workspaceId);
      set({ loading: false });
      return "joined";
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
      return false;
    }
  },

  leaveWorkspace: async (workspaceId, userId) => {
    try {
      await workspaceApi.leaveWorkspace(workspaceId);
      await get().loadWorkspaces(userId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  deleteWorkspace: async (workspaceId, userId) => {
    try {
      await workspaceApi.deleteWorkspace(workspaceId);
      await get().loadWorkspaces(userId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  updateWorkspace: async (workspaceId, updates, userId) => {
    try {
      await workspaceApi.updateWorkspace(workspaceId, updates);
      await get().loadWorkspaces(userId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  regenerateInvite: async (workspaceId, userId) => {
    try {
      const code = await workspaceApi.regenerateInviteCode(workspaceId);
      await get().loadWorkspaces(userId);
      return code;
    } catch (error) {
      set({ error: errorMessage(error) });
      return null;
    }
  },

  createDocument: async (title, userId, content = "") => {
    const workspaceId = get().activeWorkspaceId;
    // The request can be slow when the cloud backend is under load. Guard at
    // the store boundary as well as in the UI so repeated clicks/Enter presses
    // cannot enqueue multiple document creations.
    if (!workspaceId || get().creatingDocument) return false;
    set({ creatingDocument: true, error: null });
    try {
      const document = await workspaceApi.createDocument(workspaceId, userId, title, content);
      set((state) => ({
        // The INSERT realtime event may finish reloading this document before
        // the create request returns. Replace that copy instead of prepending
        // the same document a second time.
        documents: [document, ...state.documents.filter((item) => item.id !== document.id)],
        activeDocumentId: document.id,
        error: null,
      }));
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    } finally {
      set({ creatingDocument: false });
    }
  },

  updateDocumentTitle: async (documentId, title) => {
    try {
      await workspaceApi.updateDocument(documentId, { title });
      set((state) => ({
        documents: state.documents.map((document) =>
          document.id === documentId
            ? { ...document, title, updatedAt: new Date().toISOString() }
            : document
        ),
        error: null,
      }));
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  reorderDocument: async (documentId, referenceDocumentId, position) => {
    if (documentId === referenceDocumentId || get().reorderingDocument) return false;

    const workspaceId = get().activeWorkspaceId;
    const previousDocuments = get().documents;
    const documents = reorderDocuments(
      previousDocuments,
      documentId,
      referenceDocumentId,
      position,
    );
    if (documents === previousDocuments) return true;

    set({ documents, reorderingDocument: true, error: null });
    try {
      await workspaceApi.reorderDocument(documentId, referenceDocumentId, position);
      return true;
    } catch (error) {
      set((state) => ({
        ...(state.activeWorkspaceId === workspaceId ? { documents: previousDocuments } : {}),
        error: errorMessage(error),
      }));
      return false;
    } finally {
      set({ reorderingDocument: false });
    }
  },

  setDocumentPublication: async (documentId, action, scheduledPublishAt) => {
    try {
      await workspaceApi.setDocumentPublication(documentId, action, scheduledPublishAt);
      const now = new Date().toISOString();
      set((state) => ({
        documents: state.documents.map((document) => {
          if (document.id !== documentId) return document;
          if (action === "publish_now") {
            return {
              ...document,
              accessLevel: "members",
              publicationStatus: "published",
              scheduledPublishAt: null,
              publishedAt: now,
              updatedAt: now,
            };
          }
          if (action === "schedule") {
            return {
              ...document,
              publicationStatus: "scheduled",
              scheduledPublishAt: scheduledPublishAt ?? null,
              publishedAt: null,
              updatedAt: now,
            };
          }
          // Cancelling a schedule preserves its audience; unpublishing returns
          // the document to the creator-and-manager audience.
          return {
            ...document,
            ...(action === "unpublish" ? { accessLevel: "managers" as const } : {}),
            publicationStatus: "draft",
            scheduledPublishAt: null,
            publishedAt: null,
            updatedAt: now,
          };
        }),
        error: null,
      }));
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  setDocumentAccessLevel: async (documentId, accessLevel) => {
    try {
      await workspaceApi.setDocumentAccessLevel(documentId, accessLevel);
      const now = new Date().toISOString();
      set((state) => ({
        documents: state.documents.map((document) => document.id === documentId
          ? {
              ...document,
              accessLevel,
              publicationStatus: accessLevel === "members" ? "published" : "draft",
              scheduledPublishAt: null,
              publishedAt: accessLevel === "members" ? document.publishedAt ?? now : null,
              updatedAt: now,
            }
          : document),
        error: null,
      }));
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  deleteDocument: async (documentId) => {
    try {
      await workspaceApi.deleteDocument(documentId);
      set((state) => {
        const documents = state.documents.filter((document) => document.id !== documentId);
        return {
          documents,
          activeDocumentId:
            state.activeDocumentId === documentId
              ? documents[0]?.id ?? null
              : state.activeDocumentId,
          error: null,
        };
      });
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  updateMemberRole: async (workspaceId, userId, role) => {
    try {
      await workspaceApi.updateMemberRole(workspaceId, userId, role);
      await get().loadMembers(workspaceId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  transferWorkspaceOwnership: async (workspaceId, nextOwnerId, userId) => {
    try {
      await workspaceApi.transferWorkspaceOwnership(workspaceId, nextOwnerId);
      await get().loadWorkspaces(userId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },

  removeMember: async (workspaceId, userId) => {
    try {
      await workspaceApi.removeMember(workspaceId, userId);
      await get().loadMembers(workspaceId);
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },
}));
