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
          const minimized = await win.isMinimized();
          // Only hide when window is truly visible AND not minimized
          if (visible && !minimized) {
            await win.hide();
          } else {
            // Window is hidden or minimized → restore and focus
            if (minimized) {
              await win.unminimize();
            }
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

export async function pauseShortcuts(): Promise<void> {
  try {
    await unregisterAll();
  } catch (e) {
    console.warn("Failed to pause shortcuts:", e);
  }
}

export async function resumeShortcuts(): Promise<void> {
  if (currentShortcuts) {
    await applyShortcuts(currentShortcuts);
  }
}
