import "dotenv/config";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

type WorkspaceRole = "owner" | "editor" | "viewer";

interface ConnectionContext {
  userId: string;
  workspaceId: string;
  documentId: string;
  role: WorkspaceRole;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const port = Number(process.env.PORT || 1234);

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseRoom(documentName: string): { workspaceId: string; documentId: string } {
  const [workspaceId, documentId, extra] = documentName.split(":");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!workspaceId || !documentId || extra || !uuid.test(workspaceId) || !uuid.test(documentId)) {
    throw new Error("Invalid collaboration room");
  }
  return { workspaceId, documentId };
}

async function fetchInitialState(documentName: string): Promise<Uint8Array | null> {
  const { documentId } = parseRoom(documentName);
  const { data: stored, error: stateError } = await admin
    .from("document_states")
    .select("state_base64")
    .eq("document_id", documentId)
    .maybeSingle();
  if (stateError) throw stateError;
  if (stored?.state_base64) return Buffer.from(stored.state_base64, "base64");

  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("content")
    .eq("id", documentId)
    .single();
  if (documentError) throw documentError;
  if (!document?.content) return null;

  const ydoc = new Y.Doc();
  ydoc.getText("content").insert(0, document.content);
  return Y.encodeStateAsUpdate(ydoc);
}

async function storeState(documentName: string, state: Buffer): Promise<void> {
  const { documentId } = parseRoom(documentName);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const markdown = ydoc.getText("content").toString();

  const { error: stateError } = await admin.from("document_states").upsert({
    document_id: documentId,
    state_base64: state.toString("base64"),
  });
  if (stateError) throw stateError;

  const { error: documentError } = await admin
    .from("documents")
    .update({ content: markdown })
    .eq("id", documentId);
  if (documentError) throw documentError;
}

const server = new Server<ConnectionContext>({
  port,
  address: "0.0.0.0",
  debounce: 2_000,
  maxDebounce: 10_000,
  timeout: 30_000,
  quiet: false,
  websocketOptions: { maxPayload: 2 * 1024 * 1024 },

  async onAuthenticate({ token, documentName, connectionConfig }) {
    if (!token) throw new Error("Authentication required");
    const { workspaceId, documentId } = parseRoom(documentName);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Invalid or expired session");

    const [{ data: document, error: documentError }, { data: membership, error: memberError }] =
      await Promise.all([
        admin.from("documents").select("workspace_id").eq("id", documentId).maybeSingle(),
        admin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userData.user.id)
          .maybeSingle(),
      ]);

    if (documentError || memberError) throw documentError || memberError;
    if (!document || document.workspace_id !== workspaceId || !membership) {
      throw new Error("You do not have access to this document");
    }

    const role = membership.role as WorkspaceRole;
    connectionConfig.readOnly = role === "viewer";
    return { userId: userData.user.id, workspaceId, documentId, role };
  },

  async onTokenSync({ token, context, connectionConfig }) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || data.user?.id !== context.userId) throw new Error("Invalid refreshed session");

    const { data: membership, error: memberError } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", context.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (memberError || !membership) throw memberError || new Error("Workspace access revoked");

    const role = membership.role as WorkspaceRole;
    connectionConfig.readOnly = role === "viewer";
    return { ...context, role };
  },

  async onRequest({ request, response }) {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      throw null;
    }
  },

  extensions: [
    new Database({
      fetch: ({ documentName }) => fetchInitialState(documentName),
      store: ({ documentName, state }) => storeState(documentName, state),
    }),
  ],
});

server.listen().then(() => {
  console.log(`Cyan Notepad collaboration server listening on port ${port}`);
});
