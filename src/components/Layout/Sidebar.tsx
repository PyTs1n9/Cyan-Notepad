import React from "react";
import {
  CheckSquare,
  FileText,
  Plus,
  Tag,
  Settings,
  Trash2,
  Upload,
  FileUp,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useNoteStore } from "@/stores/noteStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { deleteNoteFile } from "@/utils/storage";
import type { ViewType } from "@/types";

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onNewNote: () => void;
  onImportMd: () => void;
  onImportTxt: () => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, onNewNote, onImportMd, onImportTxt, onOpenSettings, collapsed, onToggleCollapse }) => {
  const { notes, filterTag, setFilterTag, activeNoteId, setActiveNoteId, deleteNote } = useNoteStore();
  const lang = useSettingsStore((s) => s.lang);

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));

  return (
    <aside className="w-full h-full bg-bg-sidebar flex flex-col border-r border-border">
      {/* Logo + Collapse Toggle */}
      <div className={`px-3 py-4 flex items-center ${collapsed ? "flex-col justify-center gap-2" : "gap-2"}`}>
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">B</span>
        </div>
        {!collapsed && <span className="font-semibold text-text-primary text-base truncate">BaiQingTodo</span>}
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer"
            title={t(lang, "expandSidebar")}
          >
            <PanelLeftOpen size={14} />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="ml-auto p-1.5 rounded-lg text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer flex-shrink-0"
            title={t(lang, "collapseSidebar")}
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={`px-2 mt-2 flex flex-col ${collapsed ? "items-center gap-0.5" : "gap-1"}`}>
        <button
          onClick={() => onViewChange("todo")}
          className={`flex items-center rounded-lg text-sm transition-colors cursor-pointer
            ${collapsed ? "justify-center w-10 h-10" : "gap-3 px-3 py-2"}
            ${currentView === "todo" ? "bg-accent-light text-accent font-medium" : "text-text-secondary hover:bg-bg-hover"}`}
          title={collapsed ? t(lang, "todo") : undefined}
        >
          <CheckSquare size={16} />
          {!collapsed && <span>{t(lang, "todo")}</span>}
        </button>
        <button
          onClick={() => onViewChange("note")}
          className={`flex items-center rounded-lg text-sm transition-colors cursor-pointer
            ${collapsed ? "justify-center w-10 h-10" : "gap-3 px-3 py-2"}
            ${currentView === "note" ? "bg-accent-light text-accent font-medium" : "text-text-secondary hover:bg-bg-hover"}`}
          title={collapsed ? t(lang, "notepad") : undefined}
        >
          <FileText size={16} />
          {!collapsed && <span>{t(lang, "notepad")}</span>}
        </button>
      </nav>

      {/* Action Buttons (note view) */}
      {currentView === "note" && (
        <div className={`flex flex-col ${collapsed ? "px-1 mt-4 items-center gap-0.5" : "px-2 mt-4 gap-1.5"}`}>
          <button
            onClick={onNewNote}
            className={`flex items-center rounded-lg text-sm bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer
              ${collapsed ? "justify-center w-10 h-10" : "w-full gap-2 px-3 py-2"}`}
            title={collapsed ? t(lang, "newNote") : undefined}
          >
            <Plus size={collapsed ? 16 : 14} />
            {!collapsed && <span>{t(lang, "newNote")}</span>}
          </button>
          <button
            onClick={onImportMd}
            className={`flex items-center rounded-lg text-sm border border-border
              text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer
              ${collapsed ? "justify-center w-10 h-10" : "w-full gap-2 px-3 py-2"}`}
            title={collapsed ? t(lang, "importMd") : undefined}
          >
            <Upload size={collapsed ? 16 : 14} />
            {!collapsed && <span>{t(lang, "importMd")}</span>}
          </button>
          <button
            onClick={onImportTxt}
            className={`flex items-center rounded-lg text-sm border border-border
              text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors cursor-pointer
              ${collapsed ? "justify-center w-10 h-10" : "w-full gap-2 px-3 py-2"}`}
            title={collapsed ? t(lang, "importTxt") : undefined}
          >
            <FileUp size={collapsed ? 16 : 14} />
            {!collapsed && <span>{t(lang, "importTxt")}</span>}
          </button>
        </div>
      )}

      {/* Note List (when in note view, expanded only) */}
      {currentView === "note" && !collapsed && (
        <div className="flex-1 overflow-y-auto mt-3 px-2">
          <div className="text-xs text-text-muted px-3 py-1 uppercase tracking-wide">{t(lang, "notes")}</div>
          {notes.map((note) => (
            <div key={note.id} className="group relative mb-0.5">
              <button
                onClick={() => setActiveNoteId(note.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer
                  ${activeNoteId === note.id ? "bg-bg-active text-text-primary" : "text-text-secondary hover:bg-bg-hover"}`}
              >
                <div className="truncate font-medium pr-6">{note.title || t(lang, "untitled")}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {new Date(note.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const title = note.title || t(lang, "untitled");
                  if (confirm(`${t(lang, "confirmDelete")}${title}"？`)) {
                    deleteNote(note.id);
                    deleteNoteFile(note.id);
                  }
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
                  p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-bg-hover transition-all cursor-pointer"
                title={t(lang, "deleteNote")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-xs text-text-muted px-3 py-4 text-center">{t(lang, "noNotes")}</p>
          )}
        </div>
      )}

      {/* Tags (expanded only) */}
      {currentView === "note" && !collapsed && allTags.length > 0 && (
        <div className="px-2 mb-3">
          <div className="text-xs text-text-muted px-3 py-1 uppercase tracking-wide flex items-center gap-1">
            <Tag size={10} />
            <span>{t(lang, "tags")}</span>
          </div>
          <div className="flex flex-wrap gap-1 px-3 py-1">
            <button
              onClick={() => setFilterTag(null)}
              className={`px-2 py-0.5 rounded-full text-xs cursor-pointer
                ${!filterTag ? "bg-accent text-white" : "bg-bg-hover text-text-secondary hover:bg-bg-active"}`}
            >
              {t(lang, "all")}
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={`px-2 py-0.5 rounded-full text-xs cursor-pointer
                  ${tag === filterTag ? "bg-accent text-white" : "bg-bg-hover text-text-secondary hover:bg-bg-active"}`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto border-t border-border">
        <button
          onClick={onOpenSettings}
          className={`flex items-center rounded-lg text-sm text-text-muted hover:bg-bg-hover transition-colors cursor-pointer
            ${collapsed ? "justify-center w-full px-0 py-3" : "gap-3 px-3 py-2 w-full"}`}
          title={collapsed ? t(lang, "settings") : undefined}
        >
          <Settings size={collapsed ? 16 : 14} />
          {!collapsed && <span>{t(lang, "settings")}</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
