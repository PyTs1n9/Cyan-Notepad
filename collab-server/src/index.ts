import "dotenv/config";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

type WorkspaceRole = "owner" | "editor" | "viewer";
type DocumentPublicationStatus = "draft" | "scheduled" | "published";

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
interface ScheduledDocumentRow {
  id: string;
  scheduled_publish_at: string;
}

interface PublicationChangeRow {
  id: string;
  workspace_id: string;
  publication_status: DocumentPublicationStatus;
}

interface ScheduledPublicationTimer {
  scheduledAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const PUBLICATION_DISCOVERY_INTERVAL_MS = 5_000;
const PUBLICATION_SCHEDULING_HORIZON_MS = 60_000;
const scheduledPublicationTimers = new Map<string, ScheduledPublicationTimer>();
let publicationSweepRunning = false;

async function publishScheduledDocument(documentId: string): Promise<void> {
  const publishedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("documents")
    .update({
      publication_status: "published" satisfies DocumentPublicationStatus,
      scheduled_publish_at: null,
      published_at: publishedAt,
    })
    .eq("id", documentId)
    .eq("publication_status", "scheduled" satisfies DocumentPublicationStatus)
    .lte("scheduled_publish_at", publishedAt)
    .select("id");
  if (error) throw error;
  if (data && data.length > 0) console.log(`Published scheduled cloud document ${documentId}`);
}

function schedulePublicationTimer(row: ScheduledDocumentRow): void {
  const scheduledAt = Date.parse(row.scheduled_publish_at);
  if (!Number.isFinite(scheduledAt)) return;
  const existing = scheduledPublicationTimers.get(row.id);
  if (existing?.scheduledAt === scheduledAt) return;
  if (existing) clearTimeout(existing.timer);

  const delay = Math.max(20, scheduledAt - Date.now() + 20);
  const timer = setTimeout(() => {
    scheduledPublicationTimers.delete(row.id);
    void publishScheduledDocument(row.id).catch((error) => {
      console.error(`Failed to publish scheduled cloud document ${row.id}:`, error);
    });
  }, delay);
  scheduledPublicationTimers.set(row.id, { scheduledAt, timer });
}

async function synchronizePublicationSchedule(): Promise<void> {
  if (publicationSweepRunning) return;
  publicationSweepRunning = true;
  try {
    const publishedAt = new Date().toISOString();
    const { data: publishedDocuments, error: publishError } = await admin
      .from("documents")
      .update({
        publication_status: "published" satisfies DocumentPublicationStatus,
        scheduled_publish_at: null,
        published_at: publishedAt,
      })
      .eq("publication_status", "scheduled" satisfies DocumentPublicationStatus)
      .lte("scheduled_publish_at", publishedAt)
      .select("id");
    if (publishError) throw publishError;
    if (publishedDocuments && publishedDocuments.length > 0) {
      console.log(`Published ${publishedDocuments.length} overdue cloud document(s)`);
    }

    const horizon = new Date(Date.now() + PUBLICATION_SCHEDULING_HORIZON_MS).toISOString();
    const { data, error: discoveryError } = await admin
      .from("documents")
      .select("id, scheduled_publish_at")
      .eq("publication_status", "scheduled" satisfies DocumentPublicationStatus)
      .lte("scheduled_publish_at", horizon)
      .order("scheduled_publish_at", { ascending: true });
    if (discoveryError) throw discoveryError;

    const upcomingDocuments = (data ?? []) as ScheduledDocumentRow[];
    const upcomingIds = new Set(upcomingDocuments.map((row) => row.id));
    for (const [documentId, scheduledTimer] of scheduledPublicationTimers) {
      if (upcomingIds.has(documentId)) continue;
      clearTimeout(scheduledTimer.timer);
      scheduledPublicationTimers.delete(documentId);
    }
    upcomingDocuments.forEach(schedulePublicationTimer);
  } catch (error) {
    console.error("Failed to synchronize scheduled cloud documents:", error);
  } finally {
    publicationSweepRunning = false;
  }
}

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
        admin
          .from("documents")
          .select("workspace_id, publication_status")
          .eq("id", documentId)
          .maybeSingle(),
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
    if (role === "viewer" && document.publication_status !== "published") {
      throw new Error("This document has not been published");
    }
    connectionConfig.readOnly = role === "viewer";
    return { userId: userData.user.id, workspaceId, documentId, role };
  },

  async onTokenSync({ token, context, connectionConfig }) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || data.user?.id !== context.userId) throw new Error("Invalid refreshed session");

    const [{ data: membership, error: memberError }, { data: document, error: documentError }] =
      await Promise.all([
        admin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", context.workspaceId)
          .eq("user_id", context.userId)
          .maybeSingle(),
        admin
          .from("documents")
          .select("workspace_id, publication_status")
          .eq("id", context.documentId)
          .maybeSingle(),
      ]);
    if (memberError || documentError || !membership || !document || document.workspace_id !== context.workspaceId) {
      throw memberError || documentError || new Error("Workspace access revoked");
    }

    const role = membership.role as WorkspaceRole;
    if (role === "viewer" && document.publication_status !== "published") {
      throw new Error("This document has not been published");
    }
    connectionConfig.readOnly = role === "viewer";
    return { ...context, role };
  },

  async onStateless({ payload, connection }) {
    if (payload.length > 256) return;
    try {
      const message = JSON.parse(payload) as { type?: string; id?: string };
      if (
        message.type !== "cyan-network-ping"
        || typeof message.id !== "string"
        || message.id.length > 64
      ) return;
      connection.sendStateless(JSON.stringify({
        type: "cyan-network-pong",
        id: message.id,
      }));
    } catch {
      // Ignore unrelated stateless payloads. They may be used by future features.
    }
  },

  async onRequest({ request, response }) {
    if (request.url === "/health") {
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      });
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

function subscribeToPublicationAccessChanges(): void {
  admin
    .channel("document-publication-access")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "documents" },
      (payload) => {
        const previous = payload.old as Partial<PublicationChangeRow>;
        const current = payload.new as PublicationChangeRow;
        if (
          previous.publication_status !== "published"
          || current.publication_status !== "draft"
          || !current.workspace_id
          || !current.id
        ) return;

        const documentName = `${current.workspace_id}:${current.id}`;
        server.hocuspocus.closeConnections(documentName);
        console.log(`Closed collaboration connections for unpublished cloud document ${current.id}`);
      },
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`Publication access Realtime subscription ${status}:`, error);
      }
    });
}

server.listen().then(() => {
  console.log(`Cyan Notepad collaboration server listening on port ${port}`);
  subscribeToPublicationAccessChanges();
  void synchronizePublicationSchedule();
  setInterval(() => { void synchronizePublicationSchedule(); }, PUBLICATION_DISCOVERY_INTERVAL_MS);
});
