import { useState, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";
import { t } from "@/utils/i18n";
import type { ViewType } from "@/types";
import {
  CheckSquare,
  FileDown,
  FileText,
  FileUp,
  FolderPlus,
  Minus,
  Plus,
  Square,
  X,
  Maximize2,
  Settings,
  LogIn,
  Users,
} from "lucide-react";

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
  const activeNoteId = useNoteStore((s) => s.activeNoteId);
  const addCategory = useNoteStore((s) => s.addCategory);
  const [isMaximized, setIsMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
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

  return (
    <>
      <div
        className="flex items-center h-8 bg-bg-sidebar select-none flex-shrink-0 border-b border-border"
        onDoubleClick={handleToggleMaximize}
      >
        {/* Menu Bar */}
        <div ref={menuRef} className="flex items-center h-full relative" onDoubleClick={(e) => e.stopPropagation()}>
          {/* File Menu */}
          <div className="relative h-full flex items-center">
            <button
              data-menu-btn
              className={`px-3 h-full text-xs hover:bg-bg-hover transition-colors ${openMenu === "file" ? "bg-bg-hover" : ""}`}
              onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
            >
              {t(lang, "file")}
            </button>
            {openMenu === "file" && (
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
                <div className="border-t border-border my-1" />
                <button className={menuItemClass} onClick={handleNewNote}>
                  <Plus size={14} className="flex-shrink-0" />
                  <span>{t(lang, "newNote")}</span>
                </button>
                <button className={menuItemClass} onClick={handleNewCategory}>
                  <FolderPlus size={14} className="flex-shrink-0" />
                  <span>{t(lang, "newCategory")}</span>
                </button>
                <button className={menuItemClass} onClick={handleImportNotes}>
                  <FileUp size={14} className="flex-shrink-0" />
                  <span>{t(lang, "importNote")}</span>
                </button>
                <button
                  className={`${menuItemClass} ${activeNoteId ? "" : "opacity-50 cursor-not-allowed hover:bg-transparent"}`}
                  onClick={handleExportNote}
                  disabled={!activeNoteId}
                >
                  <FileDown size={14} className="flex-shrink-0" />
                  <span>{t(lang, "exportFile")}</span>
                </button>
                <div className="border-t border-border my-1" />
                <button className={menuItemClass} onClick={handleSettings}>
                  <Settings size={14} className="flex-shrink-0" />
                  <span>{t(lang, "settings")}</span>
                </button>
                <div className="border-t border-border my-1" />
                <button
                  className={`${menuItemClass} text-danger`}
                  onClick={handleExit}
                >
                  <X size={14} className="flex-shrink-0" />
                  <span>{t(lang, "exit")}</span>
                </button>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative h-full flex items-center">
            <button
              data-menu-btn
              className={`px-3 h-full text-xs hover:bg-bg-hover transition-colors ${openMenu === "help" ? "bg-bg-hover" : ""}`}
              onClick={() => setOpenMenu(openMenu === "help" ? null : "help")}
            >
              {t(lang, "help")}
            </button>
            {openMenu === "help" && (
              <div className="absolute top-full left-0 mt-0 bg-bg-secondary border border-border rounded-b-md shadow-lg py-1 z-50 min-w-[140px]">
                <button
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors"
                  onClick={handleAbout}
                >
                  {t(lang, "about")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Drag region */}
        <div data-tauri-drag-region className="flex-1 h-full" />

        {/* Window Controls */}
        <div className="flex items-center h-full gap-0.5 pr-1.5" onDoubleClick={(e) => e.stopPropagation()}>
          <button
            className="group flex items-center justify-center w-8 h-6 rounded-md hover:bg-accent/15 transition-all duration-150"
            onClick={onOpenAuth}
            title={authUser?.email ?? t(lang, "authSignIn")}
            aria-label={authUser?.email ?? t(lang, "authSignIn")}
          >
            {authUser?.email ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-light text-[10px] font-semibold uppercase text-accent">
                {authUser.email.slice(0, 1)}
              </span>
            ) : (
              <LogIn size={14} strokeWidth={2} className="text-text-muted transition-colors group-hover:text-accent" />
            )}
          </button>
          <button
            className="group flex items-center justify-center w-8 h-6 rounded-md hover:bg-bg-hover transition-all duration-150"
            onClick={handleMinimize}
            title={t(lang, "minimize")}
          >
            <Minus size={14} strokeWidth={2.5} className="text-text-muted group-hover:text-text-primary transition-colors" />
          </button>
          <button
            className="group flex items-center justify-center w-8 h-6 rounded-md hover:bg-accent/15 transition-all duration-150"
            onClick={handleToggleMaximize}
            title={isMaximized ? t(lang, "restore") : t(lang, "maximize")}
          >
            {isMaximized
              ? <Square size={11} strokeWidth={2.5} className="text-text-muted group-hover:text-accent transition-colors" />
              : <Maximize2 size={13} strokeWidth={2} className="text-text-muted group-hover:text-accent transition-colors" />
            }
          </button>
          <button
            className="group flex items-center justify-center w-8 h-6 rounded-md hover:bg-danger transition-all duration-150"
            onClick={handleClose}
            title={t(lang, "close")}
          >
            <X size={14} strokeWidth={2.5} className="text-text-muted group-hover:text-white transition-colors" />
          </button>
        </div>
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
    </>
  );
}
