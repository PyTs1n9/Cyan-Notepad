export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceInviteRole = Exclude<WorkspaceRole, "owner">;
export type WorkspaceDocumentPublicationStatus = "draft" | "scheduled" | "published";
export type WorkspaceDocumentPublicationAction = "publish_now" | "schedule" | "cancel_schedule" | "unpublish";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  inviteRole: WorkspaceInviteRole;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDocument {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  createdBy: string;
  publicationStatus: WorkspaceDocumentPublicationStatus;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface WorkspaceRemovalNotification {
  id: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
}

export type CollaborationStatus = "connecting" | "connected" | "disconnected" | "error";
