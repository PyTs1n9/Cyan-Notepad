import React from "react";
import { CheckSquare, FileText, Images, PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import type { ViewType } from "@/types";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

interface ActivityBarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** The narrow, always-visible navigation rail inspired by VS Code's activity bar. */
const ActivityBar: React.FC<ActivityBarProps> = ({
  currentView,
  onViewChange,
  onOpenSettings,
  collapsed,
  onToggleCollapse,
}) => {
  const lang = useSettingsStore((s) => s.lang);

  const items: Array<{ view?: ViewType; label: string; icon: React.ReactNode; disabled?: boolean }> = [
    { view: "note", label: t(lang, "notepad"), icon: <FileText size={22} strokeWidth={1.7} /> },
    { view: "todo", label: t(lang, "todo"), icon: <CheckSquare size={22} strokeWidth={1.7} /> },
    { view: "workspace", label: t(lang, "workspace"), icon: <Users size={22} strokeWidth={1.7} /> },
    { view: "canvas", label: t(lang, "canvas"), icon: <Images size={22} strokeWidth={1.7} /> },
  ];

  return (
    <aside className="flex h-full w-12 flex-shrink-0 flex-col items-center border-r border-border bg-bg-sidebar text-text-primary transition-colors">
      <nav className="flex w-full flex-col items-center gap-1" aria-label="Activity bar">
        {items.map(({ view, label, icon, disabled }) => {
          const active = !disabled && currentView === view;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (!disabled && view) onViewChange(view);
              }}
              disabled={disabled}
              title={label}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-11 w-11 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-default disabled:opacity-60 ${
                active ? "bg-bg-active text-text-primary" : ""
              }`}
            >
              {active && <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent" />}
              <span className="inline-flex">{icon}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-1 pb-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? t(lang, "expandSidebar") : t(lang, "collapseSidebar")}
          aria-label={collapsed ? t(lang, "expandSidebar") : t(lang, "collapseSidebar")}
          className="flex h-10 w-11 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {collapsed ? <PanelLeftOpen size={20} strokeWidth={1.7} /> : <PanelLeftClose size={20} strokeWidth={1.7} />}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title={t(lang, "settings")}
          aria-label={t(lang, "settings")}
          className="flex h-10 w-11 items-center justify-center text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Settings size={20} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
};

export default ActivityBar;
