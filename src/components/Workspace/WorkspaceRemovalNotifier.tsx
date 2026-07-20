import { useEffect, useState } from "react";
import { UserMinus } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { WorkspaceRemovalNotification } from "@/types/workspace";
import {
  fetchUnreadWorkspaceRemovalNotifications,
  markWorkspaceNotificationRead,
} from "@/utils/workspaceApi";
import { supabase } from "@/utils/supabase";
import { t } from "@/utils/i18n";

function mergeNotifications(
  current: WorkspaceRemovalNotification[],
  incoming: WorkspaceRemovalNotification[],
): WorkspaceRemovalNotification[] {
  const merged = new Map(current.map((notification) => [notification.id, notification]));
  incoming.forEach((notification) => merged.set(notification.id, notification));
  return Array.from(merged.values()).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export default function WorkspaceRemovalNotifier() {
  const lang = useSettingsStore((state) => state.lang);
  const user = useAuthStore((state) => state.user);
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const [notifications, setNotifications] = useState<WorkspaceRemovalNotification[]>([]);
  const currentNotification = notifications[0] ?? null;

  useEffect(() => {
    const client = supabase;
    if (!client || !user) {
      setNotifications([]);
      return;
    }

    let active = true;
    const refreshNotifications = async () => {
      try {
        const unread = await fetchUnreadWorkspaceRemovalNotifications(user.id);
        if (!active) return;
        setNotifications((current) => mergeNotifications(current, unread));
        if (unread.length > 0) void loadWorkspaces(user.id);
      } catch (error) {
        console.warn("Failed to load workspace notifications:", error);
      }
    };

    setNotifications([]);
    const channel = client
      .channel(`workspace-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workspace_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshNotifications();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshNotifications();
      });
    void refreshNotifications();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [loadWorkspaces, user]);

  const acknowledge = () => {
    if (!currentNotification || !user) return;
    setNotifications((current) => current.filter((item) => item.id !== currentNotification.id));
    void markWorkspaceNotificationRead(currentNotification.id, user.id).catch((error) => {
      console.warn("Failed to mark workspace notification as read:", error);
    });
  };

  if (!currentNotification) return null;

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center px-4"
      style={{ backgroundColor: "color-mix(in srgb, var(--color-bg-primary) 18%, rgb(0 0 0 / 48%))" }}
    >
      <div
        className="w-full max-w-[360px] overflow-hidden rounded-xl border border-border bg-bg-secondary shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="workspace-removal-notice-title"
      >
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-3 text-text-primary">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <UserMinus size={19} />
            </div>
            <div id="workspace-removal-notice-title" className="text-sm font-semibold">
              {t(lang, "removedFromWorkspaceTitle")}
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-text-secondary">
            {t(lang, "removedFromWorkspaceMessage").replace(
              "{workspace}",
              currentNotification.workspaceName,
            )}
          </p>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={acknowledge}
            autoFocus
            className="h-8 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {t(lang, "acknowledge")}
          </button>
        </div>
      </div>
    </div>
  );
}
