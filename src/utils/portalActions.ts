export const PORTAL_ACTION_EVENT = "cyan-notepad:portal-action";

export type PortalAction =
  | "new-todo-list"
  | "new-todo"
  | "create-workspace"
  | "join-workspace"
  | "new-cloud-document";

export function dispatchPortalAction(action: PortalAction): void {
  window.dispatchEvent(new CustomEvent<PortalAction>(PORTAL_ACTION_EVENT, { detail: action }));
}
