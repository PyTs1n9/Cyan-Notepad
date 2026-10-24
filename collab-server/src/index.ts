import "dotenv/config";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";

type WorkspaceRole = "owner" | "editor" | "viewer";
type DocumentAccessLevel = "creator" | "managers" | "members";
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

/**
 * Client for `auth.getUser` only.
 *
 * It used to be created per connection, which meant every handshake — including
 * ones that never present a token — allocated a Supabase client and hit the Auth
 * endpoint. `getUser(jwt)` sends the JWT as the Authorization header, so the anon
 * key here is enough and the service-role client stays out of the auth path.
 */
const anon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A token that just verified is reused for a minute instead of re-checked. */
const TOKEN_CACHE_TTL_MS = 60_000;
/** Bounded so a flood of distinct tokens cannot grow the process without limit. */
const TOKEN_CACHE_LIMIT = 1_000;
/** Supabase Auth is the scarce resource; cap how many checks are in flight. */
const MAX_CONCURRENT_VERIFICATIONS = 20;
/** A rejected token is parked instead of retried: that is what makes a
 *  credential-stuffing loop a no-op instead of a quota drain. */
const AUTH_FAILURE_COOLDOWN_MS = 5 * 60_000;
const AUTH_FAILURE_LIMIT = 5_000;
const AUTH_SWEEP_INTERVAL_MS = 60_000;

interface VerifiedToken {
  userId: string;
  expiresAt: number;
}

const verifiedTokens = new Map<string, VerifiedToken>();
const blockedTokens = new Map<string, number>();
/** Same-token handshakes that arrive together share one Auth round trip. */
const verifications = new Map<string, Promise<string>>();
let verificationsInFlight = 0;

function rememberVerifiedToken(token: string, userId: string): void {
  if (verifiedTokens.size >= TOKEN_CACHE_LIMIT) {
    // Fixed TTL means insertion order is expiry order, so the first key is the
    // oldest one and the next to expire.
    const oldest = verifiedTokens.keys().next();
    if (!oldest.done) verifiedTokens.delete(oldest.value);
  }
  verifiedTokens.set(token, { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

function rememberBlockedToken(token: string): void {
  if (blockedTokens.size >= AUTH_FAILURE_LIMIT) {
    const oldest = blockedTokens.keys().next();
    if (!oldest.done) blockedTokens.delete(oldest.value);
  }
  blockedTokens.set(token, Date.now() + AUTH_FAILURE_COOLDOWN_MS);
}

/** An auth service that rejects the token, as opposed to being unreachable. */
function isRejectedCredential(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 400 || status === 401 || status === 403;
}

/**
 * Resolve a session token to a user id, or throw.
 *
 * Callers get a fixed message; the Supabase error only goes to the server log,
 * so an anonymous client cannot tell an expired token from a malformed one.
 */
async function verifyAccessToken(token: string): Promise<string> {
  const now = Date.now();

  const cached = verifiedTokens.get(token);
  if (cached) {
    if (cached.expiresAt > now) return cached.userId;
    verifiedTokens.delete(token);
  }

  const blockedUntil = blockedTokens.get(token);
  if (blockedUntil !== undefined) {
    if (blockedUntil > now) throw new Error("Too many failed sign-in attempts, try again later");
    blockedTokens.delete(token);
  }

  // A burst of reconnects for one editor arrives with the same token; without
  // this they would each take a gate slot and each hit Auth.
  const shared = verifications.get(token);
  if (shared) return shared;

  if (verificationsInFlight >= MAX_CONCURRENT_VERIFICATIONS) {
    throw new Error("Sign-in is busy right now, try again in a moment");
  }

  verificationsInFlight += 1;
  const attempt = (async (): Promise<string> => {
    const { data, error } = await anon.auth.getUser(token);
    if (error || !data.user) {
      if (isRejectedCredential(error)) rememberBlockedToken(token);
      console.error("[auth] token verification failed:", error?.message ?? "no user in response");
      throw new Error("Invalid or expired session");
    }
    rememberVerifiedToken(token, data.user.id);
    blockedTokens.delete(token);
    return data.user.id;
  })();
  verifications.set(token, attempt);
  try {
    return await attempt;
  } finally {
    verificationsInFlight -= 1;
    if (verifications.get(token) === attempt) verifications.delete(token);
  }
}

function sweepAuthCaches(): void {
  const now = Date.now();
  for (const [token, entry] of verifiedTokens) {
    if (entry.expiresAt <= now) verifiedTokens.delete(token);
  }
  for (const [token, until] of blockedTokens) {
    if (until <= now) blockedTokens.delete(token);
  }
}

const authSweep = setInterval(sweepAuthCaches, AUTH_SWEEP_INTERVAL_MS);
// The server keeps the process alive on its own; this timer must not.
authSweep.unref();

interface ScheduledDocumentRow {
  id: string;
  scheduled_publish_at: string;
}

interface DocumentAccessChangeRow {
  id: string;
  workspace_id: string;
  access_level: DocumentAccessLevel;
  publication_status: DocumentPublicationStatus;
}

interface WorkspaceMemberChangeRow {
  workspace_id: string;
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
      access_level: "members" satisfies DocumentAccessLevel,
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
        access_level: "members" satisfies DocumentAccessLevel,
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

function canAccessDocument(role: WorkspaceRole, accessLevel: DocumentAccessLevel): boolean {
  if (role === "owner") return true;
  if (role === "editor") return accessLevel === "managers" || accessLevel === "members";
  return accessLevel === "members";
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
    const userId = await verifyAccessToken(token);

    const [{ data: document, error: documentError }, { data: membership, error: memberError }] =
      await Promise.all([
        admin
          .from("documents")
          .select("workspace_id, access_level")
          .eq("id", documentId)
          .maybeSingle(),
        admin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    if (documentError || memberError) {
      // Supabase errors name tables, policies and columns; keep them server-side.
      console.error(`[auth] access lookup failed for document ${documentId}:`, documentError ?? memberError);
      throw new Error("Unable to verify document access");
    }
    if (!document || document.workspace_id !== workspaceId || !membership) {
      throw new Error("You do not have access to this document");
    }

    const role = membership.role as WorkspaceRole;
    if (!canAccessDocument(role, document.access_level as DocumentAccessLevel)) {
      throw new Error("You do not have access to this document");
    }
    connectionConfig.readOnly = role === "viewer";
    return { userId, workspaceId, documentId, role };
  },

  async onTokenSync({ token, context, connectionConfig }) {
    if (!token) throw new Error("Invalid refreshed session");
    const userId = await verifyAccessToken(token);
    // The cache only proves the token is valid; an entry belonging to a different
    // user must still be rejected, so the identity assertion stays here.
    if (userId !== context.userId) throw new Error("Invalid refreshed session");

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
          .select("workspace_id, access_level")
          .eq("id", context.documentId)
          .maybeSingle(),
      ]);
    if (memberError || documentError) {
      console.error(`[auth] access re-check failed for document ${context.documentId}:`, memberError ?? documentError);
      throw new Error("Unable to verify document access");
    }
    if (!membership || !document || document.workspace_id !== context.workspaceId) {
      throw new Error("Workspace access revoked");
    }

    const role = membership.role as WorkspaceRole;
    if (!canAccessDocument(role, document.access_level as DocumentAccessLevel)) {
      throw new Error("Document access revoked");
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

async function closeWorkspaceConnections(workspaceId: string): Promise<void> {
  const { data, error } = await admin
    .from("documents")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  for (const document of data ?? []) {
    server.hocuspocus.closeConnections(`${workspaceId}:${document.id}`);
  }
}

function subscribeToPermissionChanges(): void {
  admin
    .channel("workspace-permission-access")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "documents" },
      (payload) => {
        const previous = payload.old as Partial<DocumentAccessChangeRow>;
        const current = payload.new as DocumentAccessChangeRow;
        if (
          previous.access_level === current.access_level
          || !current.workspace_id
          || !current.id
        ) return;

        const documentName = `${current.workspace_id}:${current.id}`;
        server.hocuspocus.closeConnections(documentName);
        console.log(`Closed collaboration connections after access changed for document ${current.id}`);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "workspace_members" },
      (payload) => {
        const previous = payload.old as Partial<WorkspaceMemberChangeRow>;
        const current = payload.new as Partial<WorkspaceMemberChangeRow>;
        const workspaceId = current.workspace_id ?? previous.workspace_id;
        if (!workspaceId) return;
        void closeWorkspaceConnections(workspaceId).catch((error) => {
          console.error(`Failed to close connections after workspace role change for ${workspaceId}:`, error);
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "workspace_members" },
      (payload) => {
        const previous = payload.old as Partial<WorkspaceMemberChangeRow>;
        if (!previous.workspace_id) return;
        void closeWorkspaceConnections(previous.workspace_id).catch((error) => {
          console.error(`Failed to close connections after workspace member removal for ${previous.workspace_id}:`, error);
        });
      },
    )
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`Permission Realtime subscription ${status}:`, error);
      }
    });
}

server.listen().then(() => {
  console.log(`Qing Notepad collaboration server listening on port ${port}`);
  subscribeToPermissionChanges();
  void synchronizePublicationSchedule();
  setInterval(() => { void synchronizePublicationSchedule(); }, PUBLICATION_DISCOVERY_INTERVAL_MS);
});
