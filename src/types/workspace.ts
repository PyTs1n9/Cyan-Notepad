export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceInviteRole = Exclude<WorkspaceRole, "owner">;

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

export type CollaborationStatus = "connecting" | "connected" | "disconnected" | "error";
