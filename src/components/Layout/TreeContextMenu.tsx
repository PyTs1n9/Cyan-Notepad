import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TreeMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface TreeContextMenuProps {
  x: number;
  y: number;
  items: TreeMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 184;
const EDGE_GAP = 8;

/** Right-click menu for the note tree. Closes on outside click, Esc or blur. */
const TreeContextMenu: React.FC<TreeContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - EDGE_GAP);
    const top = Math.min(y, window.innerHeight - rect.height - EDGE_GAP);
    setPosition({
      left: Math.max(EDGE_GAP, left),
      top: Math.max(EDGE_GAP, top),
    });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
      className="app-modal-panel fixed z-[10020] overflow-hidden rounded-lg border border-border bg-bg-primary py-1 text-text-primary shadow-xl"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <React.Fragment key={item.key}>
          {item.separatorBefore && <div className="my-1 h-px bg-border" aria-hidden="true" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`flex h-7 w-full items-center gap-2 px-2.5 text-left text-xs transition-colors
              ${item.disabled
                ? "cursor-not-allowed text-text-muted/45"
                : item.danger
                  ? "cursor-pointer text-danger hover:bg-danger/10"
                  : "cursor-pointer text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
          >
            <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 select-none whitespace-nowrap">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default TreeContextMenu;
