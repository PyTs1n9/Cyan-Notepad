import type { ThemeType, CustomColors } from "@/stores/settingsStore";

const THEME_CLASSES = ["theme-dark", "theme-blue", "theme-yellow", "theme-green", "theme-custom"] as const;

const CUSTOM_PROPS = [
  "--color-bg-primary",
  "--color-bg-secondary",
  "--color-bg-sidebar",
  "--color-text-primary",
  "--color-accent",
  "--color-bg-hover",
  "--color-bg-active",
  "--color-accent-light",
  "--color-accent-hover",
] as const;

export function applyTheme(theme: ThemeType, customColors: CustomColors | null): void {
  const root = document.documentElement;

  // Remove all theme classes first
  root.classList.remove(...THEME_CLASSES);

  if (theme === "custom" && customColors) {
    root.classList.add("theme-custom");
    root.style.setProperty("--color-bg-primary", customColors.bgPrimary);
    root.style.setProperty("--color-bg-secondary", customColors.bgSecondary);
    root.style.setProperty("--color-bg-sidebar", customColors.bgSidebar);
    root.style.setProperty("--color-text-primary", customColors.textPrimary);
    root.style.setProperty("--color-accent", customColors.accent);
    root.style.setProperty("--color-bg-hover", customColors.bgSecondary);
    root.style.setProperty("--color-bg-active", customColors.bgSecondary);
    root.style.setProperty("--color-accent-light", customColors.bgSecondary);
    root.style.setProperty("--color-accent-hover", customColors.accent);
  } else {
    // Clear inline custom properties
    for (const prop of CUSTOM_PROPS) {
      root.style.removeProperty(prop);
    }
    // blue is the default (no class needed)
    if (theme !== "blue") {
      root.classList.add(`theme-${theme}`);
    }
  }
}
