import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Cloud, CloudOff, Columns2, Code, Eye, Users } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { User } from "@supabase/supabase-js";
import type { CollaborationStatus, WorkspaceDocument, WorkspaceRole } from "@/types/workspace";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { supabase } from "@/utils/supabase";
import { t } from "@/utils/i18n";
import { renderMarkdown } from "@/utils/markdown";

interface CloudNoteEditorProps {
  document: WorkspaceDocument;
  workspaceId: string;
  role: WorkspaceRole;
  user: User;
}

type MarkdownViewMode = "source" | "preview" | "split";

interface AwarenessUser {
  id: string;
  name: string;
  color: string;
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--color-text-primary)",
    backgroundColor: "transparent",
    fontSize: "15px",
  },
  ".cm-scroller": {
    fontFamily: 'Consolas, "Cascadia Code", monospace',
    lineHeight: "1.7",
    overflow: "auto",
  },
  ".cm-content": { padding: "16px 20px" },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg-secondary)",
    color: "var(--color-text-muted)",
    borderRight: "1px solid var(--color-border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 22%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--color-accent)" },
  "&.cm-focused": { outline: "none" },
});

function colorForUser(userId: string): string {
  const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function CloudNoteEditor({ document, workspaceId, role, user }: CloudNoteEditorProps) {
  const lang = useSettingsStore((state) => state.lang);
  const updateDocumentTitle = useWorkspaceStore((state) => state.updateDocumentTitle);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<MarkdownViewMode>("split");
  const [status, setStatus] = useState<CollaborationStatus>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<AwarenessUser[]>([]);
  const [localTitle, setLocalTitle] = useState(document.title);
  const canEdit = role !== "viewer";
  const collabUrl = import.meta.env.VITE_COLLAB_URL?.trim();

  const identity = useMemo<AwarenessUser>(() => ({
    id: user.id,
    name: user.email?.split("@")[0] || "User",
    color: colorForUser(user.id),
  }), [user.id, user.email]);

  useEffect(() => setLocalTitle(document.title), [document.id, document.title]);

  useEffect(() => {
    if (!canEdit) return;
    const title = localTitle.trim();
    if (!title || title === document.title) return;
    const timer = window.setTimeout(() => {
      void updateDocumentTitle(document.id, title);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [canEdit, document.id, document.title, localTitle, updateDocumentTitle]);

  useEffect(() => {
    let cancelled = false;
    void renderMarkdown(content).then((html) => {
      if (!cancelled) setPreviewHtml(html);
    });
    return () => { cancelled = true; };
  }, [content]);

  useEffect(() => {
    const host = editorHostRef.current;
    const client = supabase;
    if (!host || !collabUrl || !client) return;

    setStatus("connecting");
    setConnectionError(null);
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("content");
    const undoManager = new Y.UndoManager(ytext);
    const persistence = new IndexeddbPersistence(`cyan-workspace-document-${document.id}`, ydoc);
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: `${workspaceId}:${document.id}`,
      document: ydoc,
      sessionAwareness: true,
      flushDelay: 50,
      token: async () => {
        const { data } = await client.auth.getSession();
        if (!data.session?.access_token) throw new Error("Authentication required");
        return data.session.access_token;
      },
      onStatus: ({ status: nextStatus }) => {
        setStatus(nextStatus === "connected" ? "connected" : nextStatus);
      },
      onAuthenticationFailed: ({ reason }) => {
        setStatus("error");
        setConnectionError(reason);
      },
    });

    const awareness = provider.awareness;
    awareness?.setLocalStateField("user", identity);

    const updatePresence = () => {
      if (!awareness) return;
      const users = Array.from(awareness.getStates().values())
        .map((state) => state.user as AwarenessUser | undefined)
        .filter((value): value is AwarenessUser => Boolean(value?.id));
      setOnlineUsers(Array.from(new Map(users.map((item) => [item.id, item])).values()));
    };
    awareness?.on("change", updatePresence);
    updatePresence();

    const syncContent = () => setContent(ytext.toString());
    ytext.observe(syncContent);
    syncContent();

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorState.readOnly.of(!canEdit),
        EditorView.editable.of(canEdit),
        editorTheme,
        yCollab(ytext, awareness, { undoManager }),
      ],
    });
    const view = new EditorView({ state, parent: host });

    return () => {
      ytext.unobserve(syncContent);
      awareness?.off("change", updatePresence);
      view.destroy();
      provider.destroy();
      void persistence.destroy();
      undoManager.destroy();
      ydoc.destroy();
    };
  }, [canEdit, collabUrl, document.id, identity, workspaceId]);

  if (!collabUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-text-muted">
        <div className="max-w-sm rounded-xl border border-border bg-bg-secondary/45 p-5 text-center">
          <CircleAlert className="mx-auto mb-3 text-warning" size={24} />
          <p className="text-sm text-text-primary">{t(lang, "collaborationNotConfigured")}</p>
        </div>
      </div>
    );
  }

  const statusLabel = status === "connected"
    ? t(lang, "collaborationConnected")
    : status === "connecting"
      ? t(lang, "collaborationConnecting")
      : status === "error"
        ? t(lang, "collaborationError")
        : t(lang, "collaborationDisconnected");

  const viewOptions: { value: MarkdownViewMode; label: string; icon: React.ReactNode }[] = [
    { value: "source", label: t(lang, "mdViewSource"), icon: <Code size={13} /> },
    { value: "preview", label: t(lang, "mdViewPreview"), icon: <Eye size={13} /> },
    { value: "split", label: t(lang, "mdViewSplit"), icon: <Columns2 size={13} /> },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-bg-primary">
      <div className="border-b border-border px-5 py-3">
        <input
          value={localTitle}
          onChange={(event) => setLocalTitle(event.target.value)}
          disabled={!canEdit}
          className="w-full bg-transparent text-xl font-bold text-text-primary outline-none disabled:cursor-default"
          aria-label={t(lang, "cloudDocumentName")}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className={`flex items-center gap-1 ${status === "connected" ? "text-success" : status === "error" ? "text-danger" : ""}`}>
            {status === "connected" ? <Cloud size={12} /> : <CloudOff size={12} />}
            {statusLabel}
          </span>
          <span>·</span>
          <span>{canEdit ? t(lang, "cloudSavedRealtime") : t(lang, "readOnly")}</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Users size={12} />{t(lang, "onlineUsers")} {onlineUsers.length}</span>
          <div className="flex items-center -space-x-1">
            {onlineUsers.slice(0, 6).map((onlineUser) => (
              <span
                key={onlineUser.id}
                title={onlineUser.name}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-bg-primary text-[9px] font-semibold text-white"
                style={{ backgroundColor: onlineUser.color }}
              >
                {onlineUser.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          {connectionError && <span className="truncate text-danger">{connectionError}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border bg-bg-secondary/50 px-4 py-2">
        {viewOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setViewMode(option.value)}
            className={`flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition-colors ${
              viewMode === option.value
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`${viewMode === "preview" ? "hidden" : "flex"} ${viewMode === "split" ? "w-1/2 border-r border-border" : "w-full"} min-w-0 flex-col`}>
          <div ref={editorHostRef} className="cloud-codemirror min-h-0 flex-1 overflow-hidden" />
        </div>
        <div className={`${viewMode === "source" ? "hidden" : "block"} ${viewMode === "split" ? "w-1/2" : "w-full"} overflow-y-auto px-6 py-5`}>
          <div
            className="prose max-w-none text-text-primary [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-bg-secondary [&_code]:px-1 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-secondary [&_pre]:p-3 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
