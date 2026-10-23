import type { ThemeType, CustomColors } from "@/stores/settingsStore";

const THEME_CLASSES = ["theme-dark", "theme-blue", "theme-yellow", "theme-green", "theme-custom"] as const;

const CUSTOM_PROPS = [
  "--color-bg-primary",
  "--color-bg-secondary",
  "--color-bg-sidebar",
  "--color-bg-shell",
  "--color-text-primary",
  "--color-text-secondary",
  "--color-text-muted",
  "--color-border",
  "--color-accent",
  "--color-bg-hover",
  "--color-bg-active",
  "--color-accent-light",
  "--color-accent-hover",
  "--color-danger",
] as const;

/** Rough relative brightness of a #rrggbb color; enough to split light/dark. */
function luma(hex: string): number {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3
    ? value.split("").map((char) => char + char).join("")
    : value;
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(full.slice(offset, offset + 2), 16);
    return Number.isFinite(channel) ? channel : 0;
  });
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function applyTheme(theme: ThemeType, customColors: CustomColors | null): void {
  const root = document.documentElement;

  // Remove all theme classes first
  root.classList.remove(...THEME_CLASSES);

  if (theme === "custom" && customColors) {
    root.classList.add("theme-custom");
    // The gutter has to stay one step away from the panel colors, otherwise the
    // translucent cards stop reading as lifted off the shell.
    const gutterDarken = luma(customColors.bgPrimary) > 0.5 ? 16 : 22;
    root.style.setProperty(
      "--color-bg-shell",
      `color-mix(in srgb, ${customColors.bgPrimary} ${100 - gutterDarken}%, #000)`,
    );
    root.style.setProperty("--color-bg-primary", customColors.bgPrimary);
    root.style.setProperty("--color-bg-secondary", customColors.bgSecondary);
    root.style.setProperty("--color-bg-sidebar", customColors.bgSidebar);
    root.style.setProperty("--color-text-primary", customColors.textPrimary);
    root.style.setProperty("--color-text-secondary", `color-mix(in srgb, ${customColors.textPrimary} 76%, ${customColors.bgPrimary})`);
    root.style.setProperty("--color-text-muted", `color-mix(in srgb, ${customColors.textPrimary} 56%, ${customColors.bgPrimary})`);
    root.style.setProperty("--color-border", `color-mix(in srgb, ${customColors.textPrimary} 18%, ${customColors.bgSecondary})`);
    root.style.setProperty("--color-accent", customColors.accent);
    root.style.setProperty("--color-bg-hover", customColors.bgSecondary);
    root.style.setProperty("--color-bg-active", customColors.bgSecondary);
    root.style.setProperty("--color-accent-light", customColors.bgSecondary);
    root.style.setProperty("--color-accent-hover", customColors.accent);
    root.style.setProperty("--color-danger", `color-mix(in srgb, #ef4444 72%, ${customColors.accent})`);
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
