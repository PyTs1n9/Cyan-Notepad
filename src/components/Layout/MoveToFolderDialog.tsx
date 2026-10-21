import React from "react";
import { Folder, FolderOpen } from "lucide-react";
import { getTreeIndent } from "@/components/Layout/noteTreeModel";
import { t } from "@/utils/i18n";
import type { LangType } from "@/stores/settingsStore";

export interface MoveTarget {
  /** null targets the uncategorized bucket. */
  id: string | null;
  label: string;
  depth: number;
}

interface MoveToFolderDialogProps {
  lang: LangType;
  targets: MoveTarget[];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

/**
 * Folder picker for "move to folder…". A flat indented list is easier to scan
 * than a nested submenu inside a 240–320px sidebar.
 */
const MoveToFolderDialog: React.FC<MoveToFolderDialogProps> = ({
  lang,
  targets,
  currentId,
  onSelect,
  onClose,
}) => (
  <div
    className="app-modal-backdrop fixed inset-0 z-[10030] flex items-center justify-center px-4"
    style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 42%))" }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div
      className="app-modal-panel flex max-h-[70vh] w-full max-w-[300px] flex-col overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-xl"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-text-primary">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-bg-primary text-accent">
          <FolderOpen size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t(lang, "moveToFolder")}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {targets.map((target) => {
          const isCurrent = (target.id ?? null) === (currentId ?? null);
          return (
            <button
              key={target.id ?? "uncategorized"}
              type="button"
              disabled={isCurrent}
              onClick={() => onSelect(target.id)}
              className={`flex h-8 w-full items-center gap-1.5 pr-3 text-left text-xs transition-colors
                ${isCurrent
                  ? "cursor-default text-accent"
                  : "cursor-pointer text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
              style={{ paddingLeft: getTreeIndent(target.depth) + 14 }}
            >
              <Folder size={12} className="flex-shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1 truncate">{target.label}</span>
              {isCurrent && <span className="flex-shrink-0 text-[10px]">·</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-8 cursor-pointer rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {t(lang, "confirmNo")}
        </button>
      </div>
    </div>
  </div>
);

export default MoveToFolderDialog;
