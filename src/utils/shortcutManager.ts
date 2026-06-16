import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppShortcuts } from "@/stores/settingsStore";

let currentShortcuts: AppShortcuts | null = null;

export async function applyShortcuts(
  shortcuts: AppShortcuts,
): Promise<void> {
  // Unregister all existing shortcuts first
  if (currentShortcuts) {
    try {
      await unregisterAll();
    } catch (e) {
      console.warn("Failed to unregister shortcuts:", e);
    }
  }

  // Register: toggle main window visibility
  try {
    await register(shortcuts.toggleWindow, async (event) => {
      if (event.state === "Pressed") {
        const win = getCurrentWindow();
        try {
          const visible = await win.isVisible();
          if (visible) {
            await win.hide();
          } else {
            await win.show();
            await win.setFocus();
          }
        } catch (e) {
          console.warn("Toggle window failed:", e);
        }
      }
    });
  } catch (e) {
    console.error(`Failed to register shortcut ${shortcuts.toggleWindow}:`, e);
  }

  currentShortcuts = { ...shortcuts };
}
