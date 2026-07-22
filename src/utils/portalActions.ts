export const PORTAL_ACTION_EVENT = "cyan-notepad:portal-action";

export type PortalAction =
  | "open-note-sticky"
  | "new-todo-list"
  | "new-todo"
  | "filter-todos-all"
  | "filter-todos-active"
  | "filter-todos-completed"
  | "new-canvas"
  | "add-canvas-image"
  | "add-canvas-text"
  | "fit-canvas"
  | "open-canvas-tile"
  | "export-canvas"
  | "create-workspace"
  | "join-workspace"
  | "new-cloud-document"
  | "manage-workspace"
  | "copy-workspace-invite";

export function dispatchPortalAction(action: PortalAction): void {
  window.dispatchEvent(new CustomEvent<PortalAction>(PORTAL_ACTION_EVENT, { detail: action }));
}
