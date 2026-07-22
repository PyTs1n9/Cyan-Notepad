import { useState, useRef, useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useTodoStore } from "@/stores/todoStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { t } from "@/utils/i18n";
import { dispatchPortalAction, type PortalAction } from "@/utils/portalActions";
import type { ViewType } from "@/types";
import UserAvatar from "@/components/UserAvatar";
import LoadingText from "@/components/LoadingText";
import {
  CheckSquare,
  CheckCircle2,
  Circle,
  Copy,
  FileDown,
  FilePlus2,
  FileText,
  FileUp,
  FolderPlus,
  Info,
  Images,
  ImagePlus,
  ListChecks,
  ListPlus,
  LogOut,
  Minus,
  Plus,
  Pin,
  Power,
  Square,
  X,
  Maximize2,
  Settings,
  ShieldCheck,
  Type,
  LogIn,
  Mail,
  UserPlus,
  Users,
} from "lucide-react";

interface PortalActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function PortalActionButton({ icon, label, onClick, active = false, disabled = false }: PortalActionButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`group flex min-h-12 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-accent/25 bg-accent-light text-accent"
          : "border-transparent bg-bg-primary/55 text-text-secondary hover:border-accent/20 hover:bg-accent-light hover:text-text-primary disabled:hover:border-transparent disabled:hover:bg-bg-primary/55"
      }`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${active ? "bg-accent/10" : "bg-bg-secondary text-accent group-hover:bg-accent/10"}`}>
        {icon}
      </span>
      <span className="min-w-0 truncate font-medium">{label}</span>
    </button>
  );
}

interface TitleBarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onNewNote: () => void;
  onImportTextNotes: () => void;
  onExportActiveNote: () => void;
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}

export default function TitleBar({
  currentView,
  onViewChange,
  onNewNote,
  onImportTextNotes,
  onExportActiveNote,
  onOpenAuth,
  onOpenSettings,
  onOpenAbout,
}: TitleBarProps) {
  const lang = useSettingsStore((s) => s.lang);
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);
  const authMetadata = authUser?.user_metadata as Record<string, unknown> | undefined;
  const authAvatarUrl = typeof authMetadata?.avatar_url === "string" ? authMetadata.avatar_url : null;
  const authDisplayName = typeof authMetadata?.display_name === "string" && authMetadata.display_name.trim()
    ? authMetadata.display_name.trim()
    : authUser?.email?.split("@")[0] ?? "";
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const addCategory = useNoteStore((s) => s.addCategory);
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId) ?? null
  );
  const canCreateCloudDocument = activeWorkspace?.role === "owner" || activeWorkspace?.role === "editor";
  const todoFilter = useTodoStore((s) => s.filter);
  const todoPriorityFilter = useTodoStore((s) => s.priorityFilter);
  const canvasLoaded = useCanvasStore((s) => s.loaded);
  const canvasItemCount = useCanvasStore((s) => s.board.items.length);
  const [isMaximized, setIsMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isProfilePreviewOpen, setIsProfilePreviewOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    const checkMaximized = async () => {
      setIsMaximized(await appWindow.isMaximized());
    };
    checkMaximized();
    const unlisten = appWindow.onResized(() => checkMaximized());
    return () => { unlisten.then((f) => f()); };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openMenu]);

  useEffect(() => {
    if (!isProfilePreviewOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProfilePreviewOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isProfilePreviewOpen]);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  const handleExit = () => {
    setOpenMenu(null);
    invoke('quit_app');
  };

  const handleAbout = () => {
    setOpenMenu(null);
    onOpenAbout();
  };

  const handleSettings = () => {
    setOpenMenu(null);
    onOpenSettings();
  };

  const handleOpenAuth = () => {
    setOpenMenu(null);
    onOpenAuth();
  };

  const handleProfileClick = () => {
    if (authUser) {
      setIsProfilePreviewOpen(true);
      return;
    }
    onOpenAuth();
  };

  const handleSignOut = async () => {
    if (await signOut()) setIsProfilePreviewOpen(false);
  };

  const handleViewChange = (view: ViewType) => {
    setOpenMenu(null);
    onViewChange(view);
  };

  const handleNewNote = () => {
    setOpenMenu(null);
    onNewNote();
    onViewChange("note");
  };

  const handleNewCategory = () => {
    setOpenMenu(null);
    setNewCategoryName("");
    setIsCategoryDialogOpen(true);
  };

  const handleImportNotes = () => {
    setOpenMenu(null);
    onImportTextNotes();
  };

  const handleExportNote = () => {
    if (!activeNoteId) return;
    setOpenMenu(null);
    onExportActiveNote();
  };

  const handlePortalAction = (action: PortalAction) => {
    setOpenMenu(null);
    dispatchPortalAction(action);
  };

  const closeCategoryDialog = () => {
    setIsCategoryDialogOpen(false);
    setNewCategoryName("");
  };

  const confirmAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCategory(name);
    onViewChange("note");
    closeCategoryDialog();
  };

  const menuItemClass = "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-bg-hover transition-colors";
  const portalViewMeta = currentView === "note"
    ? { label: t(lang, "notepad"), icon: FileText }
    : currentView === "todo"
      ? { label: t(lang, "todo"), icon: CheckSquare }
      : currentView === "canvas"
        ? { label: t(lang, "canvas"), icon: Images }
        : { label: t(lang, "workspace"), icon: Users };
  const PortalViewIcon = portalViewMeta.icon;

  return (
    <>
      <div
        className="relative flex h-9 flex-shrink-0 items-center bg-bg-secondary text-text-primary select-none transition-colors"
        onDoubleClick={handleToggleMaximize}
      >
        <div className="flex h-full w-12 flex-shrink-0 items-center justify-center bg-bg-sidebar" aria-hidden="true">
          <img src="/default-icon.png" alt="" className="h-6 w-6 rounded-md object-cover" />
        </div>
        {/* Menu Bar */}
        <div ref={menuRef} className="flex items-center h-full relative" onDoubleClick={(e) => e.stopPropagation()}>
          {/* Tools Menu */}
          <div className="relative h-full flex items-center">
            <button
              data-menu-btn
              className={`h-full px-3 text-xs hover:bg-bg-hover transition-colors ${openMenu === "tools" ? "bg-bg-hover" : ""}`}
              onClick={() => setOpenMenu(openMenu === "tools" ? null : "tools")}
            >
              {t(lang, "tools")}
            </button>
            {openMenu === "tools" && (
              <div className="absolute top-full left-0 mt-0 bg-bg-secondary border border-border rounded-b-md shadow-lg py-1 z-50 min-w-[172px]">
                <button
                  className={`${menuItemClass} ${currentView === "note" ? "text-accent" : ""}`}
                  onClick={() => handleViewChange("note")}
                >
                  <FileText size={14} className="flex-shrink-0" />
                  <span>{t(lang, "notepad")}</span>
                </button>
                <button
                  className={`${menuItemClass} ${currentView === "todo" ? "text-accent" : ""}`}
                  onClick={() => handleViewChange("todo")}
                >
                  <CheckSquare size={14} className="flex-shrink-0" />
                  <span>{t(lang, "todo")}</span>
                </button>
                <button
                  className={`${menuItemClass} ${currentView === "workspace" ? "text-accent" : ""}`}
                  onClick={() => handleViewChange("workspace")}
                >
                  <Users size={14} className="flex-shrink-0" />
                  <span>{t(lang, "workspace")}</span>
                </button>
                <button
                  className={`${menuItemClass} ${currentView === "canvas" ? "text-accent" : ""}`}
                  onClick={() => handleViewChange("canvas")}
                >
                  <Images size={14} className="flex-shrink-0" />
                  <span>{t(lang, "canvas")}</span>
                </button>
              </div>
            )}
          </div>

          {/* Context-aware Portal Menu */}
          <div className="relative h-full flex items-center">
            <button
              data-menu-btn
              className={`h-full px-3 text-xs hover:bg-bg-hover transition-colors ${openMenu === "portal" ? "bg-bg-hover" : ""}`}
              onClick={() => setOpenMenu(openMenu === "portal" ? null : "portal")}
              aria-haspopup="menu"
              aria-expanded={openMenu === "portal"}
            >
              {t(lang, "portal")}
            </button>
            {openMenu === "portal" && (
              <div
                className="absolute left-0 top-full z-50 max-h-[calc(100vh-48px)] w-[304px] overflow-y-auto rounded-b-xl border border-border bg-bg-secondary shadow-xl"
                role="menu"
                aria-label={`${t(lang, "portal")} · ${portalViewMeta.label}`}
              >
                <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                    <PortalViewIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-text-primary">{portalViewMeta.label}</div>
                    <div className="mt-0.5 text-[10px] text-text-muted">{t(lang, "portal")}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-2">
                {currentView === "note" && (
                  <>
                    <PortalActionButton icon={<Plus size={15} />} label={t(lang, "newNote")} onClick={handleNewNote} />
                    <PortalActionButton icon={<FolderPlus size={15} />} label={t(lang, "newCategory")} onClick={handleNewCategory} />
                    <PortalActionButton icon={<FileUp size={15} />} label={t(lang, "importNote")} onClick={handleImportNotes} />
                    <PortalActionButton icon={<FileDown size={15} />} label={t(lang, "exportFile")} onClick={handleExportNote} disabled={!activeNoteId} />
                    <PortalActionButton icon={<Pin size={15} />} label={t(lang, "pinSticky")} onClick={() => handlePortalAction("open-note-sticky")} disabled={!activeNoteId} />
                  </>
                )}
                {currentView === "todo" && (
                  <>
                    <PortalActionButton icon={<ListPlus size={15} />} label={t(lang, "newTodoList")} onClick={() => handlePortalAction("new-todo-list")} />
                    <PortalActionButton icon={<ListChecks size={15} />} label={t(lang, "filterAll")} onClick={() => handlePortalAction("filter-todos-all")} active={todoFilter === "all" && todoPriorityFilter === "all"} />
                    <PortalActionButton icon={<Circle size={15} />} label={t(lang, "filterActive")} onClick={() => handlePortalAction("filter-todos-active")} active={todoFilter === "active"} />
                    <PortalActionButton icon={<CheckCircle2 size={15} />} label={t(lang, "filterCompleted")} onClick={() => handlePortalAction("filter-todos-completed")} active={todoFilter === "completed"} />
                  </>
                )}
                {currentView === "canvas" && (
                  <>
                    <PortalActionButton icon={<Plus size={15} />} label={t(lang, "canvasNew")} onClick={() => handlePortalAction("new-canvas")} disabled={!canvasLoaded} />
                    <PortalActionButton icon={<ImagePlus size={15} />} label={t(lang, "canvasAddImage")} onClick={() => handlePortalAction("add-canvas-image")} disabled={!canvasLoaded} />
                    <PortalActionButton icon={<Type size={15} />} label={t(lang, "canvasAddText")} onClick={() => handlePortalAction("add-canvas-text")} disabled={!canvasLoaded} />
                    <PortalActionButton icon={<Maximize2 size={15} />} label={t(lang, "canvasFit")} onClick={() => handlePortalAction("fit-canvas")} disabled={!canvasLoaded} />
                    <PortalActionButton icon={<Pin size={15} />} label={t(lang, "canvasOpenTile")} onClick={() => handlePortalAction("open-canvas-tile")} disabled={!canvasLoaded} />
                    <PortalActionButton icon={<FileDown size={15} />} label={t(lang, "canvasExport")} onClick={() => handlePortalAction("export-canvas")} disabled={!canvasLoaded || canvasItemCount === 0} />
                  </>
                )}
                {currentView === "workspace" && (
                  authUser ? (
                    <>
                      <PortalActionButton icon={<Plus size={15} />} label={t(lang, "createWorkspace")} onClick={() => handlePortalAction("create-workspace")} />
                      <PortalActionButton icon={<UserPlus size={15} />} label={t(lang, "joinWorkspace")} onClick={() => handlePortalAction("join-workspace")} />
                      <PortalActionButton icon={<FilePlus2 size={15} />} label={t(lang, "newCloudDocument")} onClick={() => handlePortalAction("new-cloud-document")} disabled={!canCreateCloudDocument} />
                      <PortalActionButton icon={<ShieldCheck size={15} />} label={t(lang, "permissionManagement")} onClick={() => handlePortalAction("manage-workspace")} disabled={!activeWorkspace} />
                      <PortalActionButton icon={<Copy size={15} />} label={t(lang, "copyInvite")} onClick={() => handlePortalAction("copy-workspace-invite")} disabled={!activeWorkspace} />
                    </>
                  ) : (
                    <div className="col-span-2">
                      <PortalActionButton icon={<LogIn size={15} />} label={t(lang, "authSignIn")} onClick={handleOpenAuth} />
                    </div>
                  )
                )}
                </div>
                {currentView === "canvas" && (
                  <details className="group border-t border-border/70">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11px] font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary [&::-webkit-details-marker]:hidden">
                      <Info size={13} className="flex-shrink-0 text-accent" />
                      <span>{t(lang, "canvasGuideTitle")}</span>
                    </summary>
                    <ul className="space-y-1 px-3 pb-3 text-[10px] leading-4 text-text-muted">
                      <li>{t(lang, "canvasGuideSelect")}</li>
                      <li>{t(lang, "canvasGuidePan")}</li>
                      <li>{t(lang, "canvasGuideAdd")}</li>
                      <li>{t(lang, "canvasGuideZoom")}</li>
                      <li>{t(lang, "canvasGuideEdit")}</li>
                      <li>{t(lang, "canvasGuideOverview")}</li>
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative h-full flex items-center">
            <button
              data-menu-btn
              className={`h-full px-3 text-xs hover:bg-bg-hover transition-colors ${openMenu === "help" ? "bg-bg-hover" : ""}`}
              onClick={() => setOpenMenu(openMenu === "help" ? null : "help")}
            >
              {t(lang, "help")}
            </button>
            {openMenu === "help" && (
              <div className="absolute top-full left-0 mt-0 bg-bg-secondary border border-border rounded-b-md shadow-lg py-1 z-50 min-w-[172px]">
                <button className={menuItemClass} onClick={handleSettings}>
                  <Settings size={14} className="flex-shrink-0" />
                  <span>{t(lang, "settings")}</span>
                </button>
                <button className={menuItemClass} onClick={handleAbout}>
                  <Info size={14} className="flex-shrink-0" />
                  <span>{t(lang, "about")}</span>
                </button>
                <div className="border-t border-border my-1" />
                <button className={`${menuItemClass} text-danger`} onClick={handleExit}>
                  <Power size={14} className="flex-shrink-0" />
                  <span>{t(lang, "quitApp")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Drag region */}
        <div data-tauri-drag-region className="flex h-full flex-1 items-center justify-center text-sm font-semibold text-text-primary">
          <span data-tauri-drag-region className="flex whitespace-nowrap" aria-label="Cyan Notepad">
            {Array.from("Cyan Notepad").map((char, index) => (
              <span
                key={`${char}-${index}`}
                data-tauri-drag-region
                aria-hidden="true"
                className="inline-block cursor-default transition-all duration-150 ease-out will-change-transform hover:-translate-y-0.5 hover:scale-125 hover:text-accent"
              >
                {char === " " ? "\u00a0" : char}
              </span>
            ))}
          </span>
        </div>

        {/* Profile & Window Controls */}
        <div className="flex h-full items-center gap-0.5 pr-1.5" onDoubleClick={(e) => e.stopPropagation()}>
          <button
            className="group mr-1 flex h-7 min-w-0 max-w-[164px] items-center gap-2 rounded-full border border-border/80 bg-bg-primary/55 px-1.5 pr-2.5 shadow-sm transition-all duration-150 hover:border-accent/45 hover:bg-bg-primary"
            onClick={handleProfileClick}
            title={authUser?.email ?? t(lang, "authSignIn")}
            aria-label={authUser?.email ?? t(lang, "authSignIn")}
          >
            {authUser ? (
              <>
                <span className="relative flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/20 bg-accent-light text-[11px] font-semibold uppercase text-accent ring-1 ring-bg-secondary">
                  {authAvatarUrl ? (
                    <img
                      src={authAvatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    authDisplayName.slice(0, 1)
                  )}
                </span>
                <span className="truncate text-xs font-medium text-text-primary">
                  {authDisplayName}
                </span>
              </>
            ) : (
              <>
                <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-accent-light text-accent">
                  <LogIn size={12} strokeWidth={2.2} />
                </span>
                <span className="whitespace-nowrap text-xs font-medium text-text-secondary transition-colors group-hover:text-text-primary">
                  {t(lang, "authSignIn")}
                </span>
              </>
            )}
          </button>
          <button
            className="group flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-hover transition-all duration-150"
            onClick={handleMinimize}
            title={t(lang, "minimize")}
          >
            <Minus size={14} strokeWidth={2.5} className="text-text-muted group-hover:text-text-primary transition-colors" />
          </button>
          <button
            className="group flex h-8 w-8 items-center justify-center rounded-md hover:bg-bg-hover transition-all duration-150"
            onClick={handleToggleMaximize}
            title={isMaximized ? t(lang, "restore") : t(lang, "maximize")}
          >
            {isMaximized
              ? <Square size={11} strokeWidth={2.5} className="text-text-muted group-hover:text-text-primary transition-colors" />
              : <Maximize2 size={13} strokeWidth={2} className="text-text-muted group-hover:text-text-primary transition-colors" />
            }
          </button>
          <button
            className="group flex h-8 w-8 items-center justify-center rounded-md hover:bg-danger transition-all duration-150"
            onClick={handleClose}
            title={t(lang, "close")}
          >
            <X size={14} strokeWidth={2.5} className="text-text-muted group-hover:text-white transition-colors" />
          </button>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-12 right-0 z-10 h-px bg-border" />
      </div>

      {isCategoryDialogOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 px-4">
          <div
            className="w-full max-w-[320px] rounded-lg border border-border bg-bg-primary shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 text-text-primary">
                <div className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-accent flex-shrink-0">
                  <FolderPlus size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{t(lang, "newCategory")}</div>
                  <div className="text-xs text-text-muted mt-0.5 truncate">
                    {t(lang, "categoryNamePrompt")}
                  </div>
                </div>
              </div>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddCategory();
                  if (e.key === "Escape") closeCategoryDialog();
                }}
                autoFocus
                className="mt-4 h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent focus:bg-bg-primary"
                placeholder={t(lang, "categoryNamePrompt")}
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={closeCategoryDialog}
                className="h-8 px-3 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
              >
                {t(lang, "confirmNo")}
              </button>
              <button
                onClick={confirmAddCategory}
                disabled={!newCategoryName.trim()}
                className="h-8 px-3 rounded-lg bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {t(lang, "confirmYes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isProfilePreviewOpen && authUser && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsProfilePreviewOpen(false);
          }}
        >
          <section
            className="relative flex w-full max-w-[320px] flex-col items-center rounded-2xl border border-border bg-bg-primary px-8 py-9 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={authDisplayName}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsProfilePreviewOpen(false)}
              aria-label={t(lang, "close")}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={16} />
            </button>
            <UserAvatar
              name={authDisplayName}
              avatarUrl={authAvatarUrl}
              className="h-36 w-36 border-4 border-accent/20 bg-accent-light text-4xl font-semibold text-accent shadow-lg ring-8 ring-accent-light/50 transition-all duration-300 ease-out hover:scale-[1.03] hover:ring-accent/35 hover:shadow-[0_0_36px] hover:shadow-accent/60"
            />
            <p className="mt-5 max-w-full truncate text-base font-semibold text-text-primary">
              {authDisplayName}
            </p>
            <div className="mt-5 w-full space-y-2.5">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary/45 px-3 py-2.5 text-left">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                  <Mail size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-text-muted">{t(lang, "authEmail")}</p>
                  <p className="truncate text-sm text-text-primary">{authUser.email ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-light/45 px-3 py-2.5 text-left">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-accent">{t(lang, "authSignedIn")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={authLoading}
                  className="flex h-8 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-danger/35 bg-danger/10 px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogOut size={13} />
                  {authLoading
                    ? <LoadingText label={t(lang, "authWorking")} variant="bounce" />
                    : t(lang, "authSignOut")}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
