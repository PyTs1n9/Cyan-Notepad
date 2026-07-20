import { supabase } from "@/utils/supabase";
import type {
  Workspace,
  WorkspaceDocument,
  WorkspaceInviteRole,
  WorkspaceMember,
  WorkspaceRemovalNotification,
  WorkspaceRole,
} from "@/types/workspace";

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  invite_role: WorkspaceInviteRole;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  workspace_id: string;
  title: string;
  content?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceNotificationRow {
  id: string;
  user_id: string;
  workspace_id: string;
  workspace_name: string;
  created_at: string;
}

interface ProfileRow {
  display_name?: unknown;
  avatar_url?: unknown;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function mapDocument(row: DocumentRow): WorkspaceDocument {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    content: row.content ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWorkspaces(userId: string): Promise<Workspace[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_members")
    .select(`
      role,
      workspace:workspaces (
        id,
        name,
        owner_id,
        invite_code,
        invite_role,
        created_at,
        updated_at
      )
    `)
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).flatMap((item) => {
    const workspaceValue = item.workspace as unknown as WorkspaceRow | WorkspaceRow[] | null;
    const row = Array.isArray(workspaceValue) ? workspaceValue[0] : workspaceValue;
    if (!row) return [];
    return [{
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      inviteCode: row.invite_code,
      inviteRole: row.invite_role,
      role: item.role as WorkspaceRole,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });
}

export async function createWorkspace(name: string, userId: string): Promise<string> {
  const client = requireSupabase();
  void userId;
  const { data, error } = await client.rpc("create_workspace", {
    workspace_name: name.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function joinWorkspace(inviteCode: string): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("join_workspace_by_code", {
    join_code: inviteCode.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("leave_workspace", {
    target_workspace_id: workspaceId,
  });
  if (error) throw error;
}

export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; invite_role?: WorkspaceInviteRole },
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("update_workspace", {
    target_workspace_id: workspaceId,
    next_name: updates.name ?? null,
    next_invite_role: updates.invite_role ?? null,
  });
  if (error) throw error;
}

export async function regenerateInviteCode(workspaceId: string): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("regenerate_workspace_invite", {
    target_workspace_id: workspaceId,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_workspace", {
    target_workspace_id: workspaceId,
  });
  if (error) throw error;
}

export async function fetchDocuments(workspaceId: string): Promise<WorkspaceDocument[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("documents")
    // The editor syncs its body through Yjs; the document list only needs metadata.
    // Avoid transferring every document's full content during workspace startup.
    .select("id, workspace_id, title, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DocumentRow[]).map(mapDocument);
}

export async function createDocument(
  workspaceId: string,
  userId: string,
  title: string,
  content = "",
): Promise<WorkspaceDocument> {
  const client = requireSupabase();
  void userId;
  const { data: documentId, error: rpcError } = await client.rpc("create_document", {
    target_workspace_id: workspaceId,
    document_title: title.trim(),
    document_content: content,
  });
  if (rpcError) throw rpcError;
  const { data, error } = await client
    .from("documents")
    .select("id, workspace_id, title, content, created_by, created_at, updated_at")
    .eq("id", documentId)
    .single();
  if (error) throw error;
  return mapDocument(data as DocumentRow);
}

export async function updateDocument(
  documentId: string,
  updates: { title?: string; content?: string },
): Promise<void> {
  const client = requireSupabase();
  if (updates.title !== undefined) {
    const { error } = await client.rpc("update_document_title", {
      target_document_id: documentId,
      next_title: updates.title,
    });
    if (error) throw error;
  }
  if (updates.content !== undefined) {
    const { error } = await client.from("documents").update({ content: updates.content }).eq("id", documentId);
    if (error) throw error;
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_document", {
    target_document_id: documentId,
  });
  if (error) throw error;
}

export async function fetchMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_members")
    .select(`
      user_id,
      role,
      joined_at,
      profile:profiles (
        display_name,
        avatar_url
      )
    `)
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((item) => {
    const profileValue = item.profile as unknown as
      | ProfileRow
      | ProfileRow[]
      | null;
    const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
    const displayName = typeof profile?.display_name === "string"
      ? profile.display_name.trim()
      : "";
    const avatarUrl = typeof profile?.avatar_url === "string" && profile.avatar_url.trim()
      ? profile.avatar_url
      : null;
    return {
      userId: item.user_id as string,
      role: item.role as WorkspaceRole,
      joinedAt: item.joined_at as string,
      displayName: displayName || "User",
      avatarUrl,
    };
  });
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceInviteRole,
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("update_workspace_member_role", {
    target_workspace_id: workspaceId,
    target_user_id: userId,
    next_role: role,
  });
  if (error) throw error;
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("remove_workspace_member", {
    target_workspace_id: workspaceId,
    target_user_id: userId,
  });
  if (error) throw error;
}

export async function fetchUnreadWorkspaceRemovalNotifications(
  userId: string,
): Promise<WorkspaceRemovalNotification[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("workspace_notifications")
    .select("id, user_id, workspace_id, workspace_name, created_at")
    .eq("user_id", userId)
    .eq("type", "member_removed")
    .is("read_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as WorkspaceNotificationRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    createdAt: row.created_at,
  }));
}

export async function markWorkspaceNotificationRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("workspace_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw error;
}
