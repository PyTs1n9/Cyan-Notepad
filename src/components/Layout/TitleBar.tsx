import { useState, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import {
  Minus,
  Square,
  X,
  Maximize2,
  Settings,
} from "lucide-react";

interface TitleBarProps {
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}

export default function TitleBar({ onOpenSettings, onOpenAbout }: TitleBarProps) {
  const lang = useSettingsStore((s) => s.lang);
  const [isMaximized, setIsMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
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

  return (
    <div
      className="flex items-center h-8 bg-bg-sidebar select-none flex-shrink-0 border-b border-border"
      onDoubleClick={handleToggleMaximize}
    >
      {/* Menu Bar */}
      <div ref={menuRef} className="flex items-center h-full relative">
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
            <div className="absolute top-full left-0 mt-0 bg-bg-secondary border border-border rounded-b-md shadow-lg py-1 z-50 min-w-[140px]">
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover transition-colors"
                onClick={handleSettings}
              >
                {t(lang, "settings")}
              </button>
              <div className="border-t border-border my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover text-danger transition-colors"
                onClick={handleExit}
              >
                {t(lang, "exit")}
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
      <div className="flex items-center h-full gap-0.5 pr-1.5">
        <button
          className="group flex items-center justify-center w-8 h-6 rounded-md hover:bg-accent/15 transition-all duration-150"
          onClick={onOpenSettings}
          title={t(lang, "settings")}
        >
          <Settings size={14} strokeWidth={2} className="text-text-muted group-hover:text-accent group-hover:rotate-45 transition-all duration-300" />
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
  );
}
