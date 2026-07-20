import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Cloud, CloudOff, Columns2, Code, Eye, Highlighter, Users } from "lucide-react";
import { Compartment, EditorState, StateEffect, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { yCollab } from "y-codemirror.next";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { User } from "@supabase/supabase-js";
import type { CollaborationStatus, WorkspaceDocument, WorkspaceRole } from "@/types/workspace";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { supabase } from "@/utils/supabase";
import { t } from "@/utils/i18n";
import { renderMarkdown } from "@/utils/markdown";
import UserAvatar from "@/components/UserAvatar";

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
  avatarUrl: string | null;
  color: string;
  colorLight: string;
}

interface RelativePositionJSON {
  type?: { client: number; clock: number };
  tname?: string;
  item?: { client: number; clock: number };
  assoc?: number;
}

interface RecentEditAwareness {
  from: RelativePositionJSON;
  to: RelativePositionJSON;
  timestamp: number;
}

interface CollaborationVisualsRuntime {
  view: EditorView;
  compartment: Compartment;
  awareness: Awareness;
  ytext: Y.Text;
  undoManager: Y.UndoManager;
}

const RECENT_EDIT_DURATION = 2400;
const recentEditChange = StateEffect.define<null>();

function colorWithAlpha(color: string, alpha: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? `${color}${alpha}` : `color-mix(in srgb, ${color} 25%, transparent)`;
}

function changedRangeFromDelta(
  delta: Array<{ insert?: unknown; delete?: number; retain?: number }>,
): { from: number; to: number } | null {
  let position = 0;
  let from = Number.POSITIVE_INFINITY;
  let to = 0;

  for (const operation of delta) {
    if (typeof operation.insert === "string") {
      const length = operation.insert.length;
      if (length > 0) {
        from = Math.min(from, position);
        to = Math.max(to, position + length);
        position += length;
      }
      continue;
    }
    if (typeof operation.delete === "number") {
      from = Math.min(from, position);
      to = Math.max(to, position);
      continue;
    }
    position += operation.retain ?? 0;
  }

  return Number.isFinite(from) ? { from, to } : null;
}

function absolutePosition(
  position: RelativePositionJSON | undefined,
  ytext: Y.Text,
): number | null {
  if (!position) return null;
  try {
    if (!ytext.doc) return null;
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(position),
      ytext.doc,
    );
    return absolute?.type === ytext ? absolute.index : null;
  } catch {
    return null;
  }
}

function recentChangesExtension(ytext: Y.Text, awareness: Awareness) {
  return ViewPlugin.fromClass(class {
    decorations = Decoration.none;
    private expirationTimer: number | null = null;
    private refreshQueued = false;
    private destroyed = false;

    constructor(private readonly view: EditorView) {
      this.rebuild();
      awareness.on("change", this.handleAwarenessChange);
      this.scheduleExpiration();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.transactions.length > 0) this.rebuild();
    }

    destroy() {
      this.destroyed = true;
      awareness.off("change", this.handleAwarenessChange);
      if (this.expirationTimer !== null) window.clearTimeout(this.expirationTimer);
    }

    private readonly handleAwarenessChange = () => {
      if (this.destroyed) return;
      this.rebuild();
      this.queueRefresh();
      this.scheduleExpiration();
    };

    private queueRefresh() {
      if (this.refreshQueued) return;
      this.refreshQueued = true;
      queueMicrotask(() => {
        this.refreshQueued = false;
        if (!this.destroyed) this.view.dispatch({ effects: recentEditChange.of(null) });
      });
    }

    private scheduleExpiration() {
      if (this.expirationTimer !== null) window.clearTimeout(this.expirationTimer);
      const now = Date.now();
      let nextExpiration = Number.POSITIVE_INFINITY;
      awareness.getStates().forEach((state) => {
        const recentEdit = state.recentEdit as RecentEditAwareness | undefined;
        if (recentEdit && typeof recentEdit.timestamp === "number") {
          nextExpiration = Math.min(nextExpiration, recentEdit.timestamp + RECENT_EDIT_DURATION);
        }
      });
      const delay = nextExpiration - now;
      if (Number.isFinite(nextExpiration) && delay > 0) {
        this.expirationTimer = window.setTimeout(() => {
          this.expirationTimer = null;
          if (!this.destroyed) {
            this.rebuild();
            this.queueRefresh();
            this.scheduleExpiration();
          }
        }, delay);
      }
    }

    private rebuild() {
      const now = Date.now();
      const ranges: Array<{ from: number; to: number; color: string; colorLight: string }> = [];
      awareness.getStates().forEach((state) => {
        const recentEdit = state.recentEdit as RecentEditAwareness | undefined;
        const user = state.user as AwarenessUser | undefined;
        if (!recentEdit || !user?.color || typeof recentEdit.timestamp !== "number") return;
        if (now - recentEdit.timestamp >= RECENT_EDIT_DURATION) return;
        const from = absolutePosition(recentEdit.from, ytext);
        const to = absolutePosition(recentEdit.to, ytext);
        if (from === null || to === null) return;
        ranges.push({
          from: Math.min(from, to),
          to: Math.max(from, to),
          color: user.color,
          colorLight: user.colorLight || colorWithAlpha(user.color, "38"),
        });
      });

      ranges.sort((left, right) => left.from - right.from || left.to - right.to);
      const decorations = [];
      for (const range of ranges) {
        if (range.from === range.to) {
          const line = this.view.state.doc.lineAt(range.from);
          decorations.push(Decoration.line({
            attributes: {
              class: "cm-yRecentChange",
              style: `background-color: ${range.colorLight}; box-shadow: inset 3px 0 0 ${range.color}`,
            },
          }).range(line.from));
        } else {
          decorations.push(Decoration.mark({
            attributes: {
              class: "cm-yRecentChange",
              style: `background-color: ${range.colorLight}; border-bottom: 2px solid ${range.color}`,
            },
          }).range(range.from, range.to));
        }
      }
      this.decorations = Decoration.set(decorations, true);
    }
  }, { decorations: (value) => value.decorations });
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
  ".cm-cursor": {
    borderLeftColor: "var(--collab-user-color, var(--color-accent))",
    borderLeftWidth: "2px",
  },
  ".cm-ySelectionCaret": {
    borderLeftWidth: "2px",
    borderRightWidth: "2px",
    marginLeft: "-2px",
    marginRight: "-2px",
    zIndex: "10",
    filter: "drop-shadow(0 0 4px color-mix(in srgb, var(--color-accent) 70%, transparent))",
  },
  ".cm-ySelectionCaretDot": {
    width: ".72em",
    height: ".72em",
    top: "-.36em",
    left: "-.36em",
    border: "2px solid var(--color-bg-primary)",
    boxShadow: "0 0 0 1px color-mix(in srgb, var(--color-text-primary) 35%, transparent)",
  },
  ".cm-ySelectionInfo": {
    top: "-1.35em",
    fontFamily: '"Segoe UI", "PingFang SC", sans-serif',
    fontWeight: "600",
    padding: "3px 6px",
    borderRadius: "4px",
    boxShadow: "0 2px 7px color-mix(in srgb, var(--color-text-primary) 20%, transparent)",
    opacity: "1",
  },
  ".cm-yRecentChange": {
    borderRadius: "2px",
    transition: "background-color 180ms ease, border-color 180ms ease",
  },
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
  const showHighlights = useSettingsStore((state) => state.showWorkspaceHighlights);
  const setShowHighlights = useSettingsStore((state) => state.setShowWorkspaceHighlights);
  const updateDocumentTitle = useWorkspaceStore((state) => state.updateDocumentTitle);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const collaborationVisualsRef = useRef<CollaborationVisualsRuntime | null>(null);
  const showHighlightsRef = useRef(showHighlights);
  showHighlightsRef.current = showHighlights;
  const [viewMode, setViewMode] = useState<MarkdownViewMode>("split");
  const [splitRatio, setSplitRatio] = useState(50);
  const [resizingSplit, setResizingSplit] = useState(false);
  const [status, setStatus] = useState<CollaborationStatus>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<AwarenessUser[]>([]);
  const [localTitle, setLocalTitle] = useState(document.title);
  const localTitleRef = useRef(document.title);
  const persistedTitleRef = useRef(document.title);
  const titleDirtyRef = useRef(false);
  const titleSaveTimerRef = useRef<number | null>(null);
  const titleSaveInProgressRef = useRef(false);
  const queuedTitleRef = useRef<string | null>(null);
  localTitleRef.current = localTitle;
  const canEdit = role !== "viewer";
  const collabUrl = import.meta.env.VITE_COLLAB_URL?.trim();
  const userMetadata = user.user_metadata as Record<string, unknown>;
  const displayName = typeof userMetadata.display_name === "string" && userMetadata.display_name.trim()
    ? userMetadata.display_name.trim()
    : user.email?.split("@")[0] || "User";
  const avatarUrl = typeof userMetadata.avatar_url === "string" && userMetadata.avatar_url
    ? userMetadata.avatar_url
    : null;

  const identity = useMemo<AwarenessUser>(() => ({
    id: user.id,
    name: displayName,
    avatarUrl,
    color: colorForUser(user.id),
    colorLight: colorWithAlpha(colorForUser(user.id), "38"),
  }), [avatarUrl, displayName, user.id]);

  const clearTitleSaveTimer = useCallback(() => {
    if (titleSaveTimerRef.current === null) return;
    window.clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = null;
  }, []);

  const flushQueuedTitle = useCallback(async () => {
    if (titleSaveInProgressRef.current) return;
    titleSaveInProgressRef.current = true;
    try {
      while (queuedTitleRef.current !== null) {
        const title = queuedTitleRef.current;
        queuedTitleRef.current = null;
        if (title === persistedTitleRef.current) {
          if (localTitleRef.current.trim() === title) titleDirtyRef.current = false;
          continue;
        }

        const saved = await updateDocumentTitle(document.id, title);
        if (!saved) break;
        persistedTitleRef.current = title;
        if (localTitleRef.current.trim() === title) titleDirtyRef.current = false;
        if (!titleDirtyRef.current && localTitleRef.current !== title) {
          localTitleRef.current = title;
          setLocalTitle(title);
        }
      }
    } finally {
      titleSaveInProgressRef.current = false;
    }
  }, [document.id, updateDocumentTitle]);

  const requestTitleSave = useCallback(() => {
    if (!canEdit) return;
    const title = localTitleRef.current.trim();
    if (!title) return;
    queuedTitleRef.current = title;
    void flushQueuedTitle();
  }, [canEdit, flushQueuedTitle]);

  const commitTitle = useCallback(() => {
    clearTitleSaveTimer();
    const title = localTitleRef.current.trim();
    if (!title) {
      queuedTitleRef.current = null;
      titleDirtyRef.current = false;
      localTitleRef.current = persistedTitleRef.current;
      setLocalTitle(persistedTitleRef.current);
      return;
    }
    if (localTitleRef.current !== title) {
      localTitleRef.current = title;
      setLocalTitle(title);
    }
    titleDirtyRef.current = title !== persistedTitleRef.current;
    requestTitleSave();
  }, [clearTitleSaveTimer, requestTitleSave]);

  useEffect(() => {
    if (
      !titleDirtyRef.current
      && !titleSaveInProgressRef.current
      && queuedTitleRef.current === null
    ) {
      persistedTitleRef.current = document.title;
      if (localTitleRef.current === document.title) return;
      localTitleRef.current = document.title;
      setLocalTitle(document.title);
    }
  }, [document.id, document.title]);

  useEffect(() => {
    if (!resizingSplit) return;

    const updateSplitRatio = (event: PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nextRatio = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.min(75, Math.max(25, nextRatio)));
    };
    const stopResizing = () => setResizingSplit(false);

    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";
    window.addEventListener("pointermove", updateSplitRatio);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", updateSplitRatio);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.document.body.style.cursor = "";
      window.document.body.style.userSelect = "";
    };
  }, [resizingSplit]);

  useEffect(() => {
    if (!canEdit || !titleDirtyRef.current || !localTitle.trim()) return;
    const timer = window.setTimeout(requestTitleSave, 600);
    titleSaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (titleSaveTimerRef.current === timer) titleSaveTimerRef.current = null;
    };
  }, [canEdit, localTitle, requestTitleSave]);

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

    const collaborationVisuals = new Compartment();
    const collaborationExtension = [
      yCollab(ytext, showHighlightsRef.current ? awareness : null, { undoManager }),
      ...(showHighlightsRef.current && awareness ? [recentChangesExtension(ytext, awareness)] : []),
    ];
    const extensions: Extension[] = [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!canEdit),
      // Keep the content DOM focusable for viewers so their selection/caret is
      // published through awareness. The read-only facet still blocks edits.
      EditorView.editable.of(true),
      collaborationVisuals.of(collaborationExtension),
      editorTheme,
    ];

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions,
    });
    const view = new EditorView({ state, parent: host });
    if (awareness) {
      collaborationVisualsRef.current = {
        view,
        compartment: collaborationVisuals,
        awareness,
        ytext,
        undoManager,
      };
    }

    let recentEditTimer: number | null = null;
    let removeRecentEditObserver: (() => void) | null = null;
    if (awareness) {
      const publishRecentEdit = (
        event: Y.YTextEvent,
        transaction: Y.Transaction,
      ) => {
        if (!transaction.local) return;
        const changedRange = changedRangeFromDelta(event.delta);
        if (!changedRange) return;
        const timestamp = Date.now();
        awareness.setLocalStateField("recentEdit", {
          from: Y.relativePositionToJSON(
            Y.createRelativePositionFromTypeIndex(ytext, changedRange.from, -1),
          ),
          to: Y.relativePositionToJSON(
            Y.createRelativePositionFromTypeIndex(ytext, changedRange.to, 1),
          ),
          timestamp,
        } satisfies RecentEditAwareness);
        if (recentEditTimer !== null) window.clearTimeout(recentEditTimer);
        recentEditTimer = window.setTimeout(() => {
          const currentEdit = awareness.getLocalState()?.recentEdit as RecentEditAwareness | undefined;
          if (currentEdit?.timestamp === timestamp) awareness.setLocalStateField("recentEdit", null);
          recentEditTimer = null;
        }, RECENT_EDIT_DURATION);
      };
      ytext.observe(publishRecentEdit);
      removeRecentEditObserver = () => ytext.unobserve(publishRecentEdit);
    }

    return () => {
      removeRecentEditObserver?.();
      if (recentEditTimer !== null) window.clearTimeout(recentEditTimer);
      ytext.unobserve(syncContent);
      awareness?.off("change", updatePresence);
      if (collaborationVisualsRef.current?.view === view) collaborationVisualsRef.current = null;
      view.destroy();
      provider.destroy();
      void persistence.destroy();
      undoManager.destroy();
      ydoc.destroy();
    };
  }, [canEdit, collabUrl, document.id, identity, workspaceId]);

  useEffect(() => {
    const runtime = collaborationVisualsRef.current;
    if (!runtime) return;
    if (!showHighlights) runtime.awareness.setLocalStateField("cursor", null);
    runtime.view.dispatch({
      effects: runtime.compartment.reconfigure(
        showHighlights
          ? [
              yCollab(runtime.ytext, runtime.awareness, { undoManager: runtime.undoManager }),
              recentChangesExtension(runtime.ytext, runtime.awareness),
            ]
          : [yCollab(runtime.ytext, null, { undoManager: runtime.undoManager })],
      ),
    });
    // The remote-selection plugin builds its first decoration set during an
    // update. Trigger one after enabling it so existing peers appear immediately.
    if (showHighlights) runtime.view.dispatch({});
  }, [showHighlights]);

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
  const viewModeIndex = viewOptions.findIndex((option) => option.value === viewMode);
  const highlightsToggleLabel = t(lang, "userHighlights");

  return (
    <div className="workspace-editor-surface flex min-w-0 flex-1 flex-col bg-bg-primary">
      <div className="relative z-20 flex items-center gap-4 border-b border-border px-5 py-3">
        <input
          value={localTitle}
          onChange={(event) => {
            localTitleRef.current = event.target.value;
            titleDirtyRef.current = true;
            setLocalTitle(event.target.value);
          }}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              clearTitleSaveTimer();
              queuedTitleRef.current = null;
              titleDirtyRef.current = false;
              localTitleRef.current = persistedTitleRef.current;
              setLocalTitle(persistedTitleRef.current);
              event.currentTarget.blur();
            }
          }}
          disabled={!canEdit}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-xl font-bold text-text-primary outline-none disabled:cursor-default"
          aria-label={t(lang, "cloudDocumentName")}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-text-muted">
          <span className={`flex items-center gap-1 ${status === "connected" ? "text-success" : status === "error" ? "text-danger" : ""}`}>
            {status === "connected" ? <Cloud size={12} /> : <CloudOff size={12} />}
            {statusLabel}
          </span>
          <span aria-hidden="true">·</span>
          <span>{canEdit ? t(lang, "cloudSavedRealtime") : t(lang, "readOnly")}</span>
          <span aria-hidden="true">·</span>
          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label={`${t(lang, "onlineUsers")} ${onlineUsers.length}`}
              aria-haspopup="true"
            >
              <span className="flex items-center gap-1">
                <Users size={12} />
                {t(lang, "onlineUsers")} {onlineUsers.length}
              </span>
              <span className="flex items-center -space-x-1">
                  {onlineUsers.slice(0, 3).map((onlineUser) => (
                    <UserAvatar
                      key={onlineUser.id}
                      name={onlineUser.name}
                      avatarUrl={onlineUser.avatarUrl}
                      className="h-5 w-5 border border-bg-primary text-[11px] font-semibold text-white"
                      style={{ backgroundColor: onlineUser.color }}
                    />
                  ))}
                {onlineUsers.length > 3 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-bg-primary bg-bg-active px-1 text-[11px] font-semibold text-text-secondary">
                    +{onlineUsers.length - 3}
                  </span>
                )}
              </span>
            </button>
            {onlineUsers.length > 0 && (
              <div className="invisible absolute right-0 top-full z-50 w-52 translate-y-1 pt-2 opacity-0 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="rounded-xl border border-border bg-bg-primary/95 p-2 shadow-xl backdrop-blur-sm">
                  <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-text-muted">
                    {t(lang, "onlineUsers")} · {onlineUsers.length}
                  </div>
                  <div className="max-h-56 space-y-0.5 overflow-y-auto">
                    {onlineUsers.map((onlineUser) => (
                      <div
                        key={onlineUser.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs text-text-primary hover:bg-bg-hover"
                      >
                            <UserAvatar
                              name={onlineUser.name}
                              avatarUrl={onlineUser.avatarUrl}
                              className="h-6 w-6 text-[11px] font-semibold text-white"
                              style={{ backgroundColor: onlineUser.color }}
                            />
                        <span className="min-w-0 flex-1 truncate" title={onlineUser.name}>
                          {onlineUser.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {connectionError && (
            <span className="max-w-44 truncate text-danger" title={connectionError}>{connectionError}</span>
          )}
        </div>
      </div>

      <div className="flex items-center border-b border-border bg-bg-secondary/50 px-4 py-2">
        <div className="relative grid h-8 grid-cols-3 items-center overflow-hidden rounded-full bg-bg-secondary p-0.5">
          <div
            className="markdown-view-pill pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full"
            style={{
              width: "calc((100% - 4px) / 3)",
              transform: `translateX(${viewModeIndex * 100}%)`,
            }}
          >
            <span key={viewMode} className="markdown-view-pill-fill" />
          </div>
          {viewOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setViewMode(option.value)}
              title={option.label}
              className={`relative z-10 flex h-7 min-w-[4.25rem] cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium leading-none transition-colors duration-150 ${
                viewMode === option.value
                  ? "text-white"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          <button
            type="button"
            role="switch"
            aria-checked={showHighlights}
            aria-label={highlightsToggleLabel}
            title={highlightsToggleLabel}
            onClick={() => setShowHighlights(!showHighlights)}
            className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-bg-primary px-2.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <Highlighter size={14} />
            <span>{highlightsToggleLabel}</span>
            <span className={`relative h-4 w-7 rounded-full transition-colors ${showHighlights ? "bg-accent" : "bg-border"}`}>
              <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${showHighlights ? "translate-x-3" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      </div>

      <div ref={splitContainerRef} className="flex min-h-0 flex-1">
        <div
          className={`${viewMode === "preview" ? "hidden" : "flex"} ${viewMode === "split" ? "flex-none" : "w-full"} min-w-0 flex-col`}
          style={viewMode === "split" ? { width: `calc(${splitRatio}% - 4px)` } : undefined}
        >
          <div
            ref={editorHostRef}
            className="cloud-codemirror min-h-0 flex-1 overflow-hidden"
            style={{ "--collab-user-color": identity.color } as React.CSSProperties}
          />
        </div>
        {viewMode === "split" && (
          <div
            role="separator"
            aria-label={t(lang, "mdViewSplit")}
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(splitRatio)}
            onPointerDown={(event) => {
              event.preventDefault();
              setResizingSplit(true);
            }}
            onDoubleClick={() => setSplitRatio(50)}
            className="group relative h-full w-2 flex-shrink-0 cursor-col-resize bg-transparent"
            title={t(lang, "mdViewSplit")}
          >
            <span
              aria-hidden="true"
              className={`sidebar-resize-guide pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
                resizingSplit ? "sidebar-resize-guide--active bg-accent/80" : "bg-accent/30 group-hover:bg-accent/50"
              }`}
            />
          </div>
        )}
        <div className={`${viewMode === "source" ? "hidden" : "block"} ${viewMode === "split" ? "min-w-0 flex-1" : "w-full"} overflow-y-auto px-6 py-5`}>
          <div
            className="prose mx-auto w-full max-w-[820px] text-text-primary [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-bg-secondary [&_code]:px-1 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg-secondary [&_pre]:p-3 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
