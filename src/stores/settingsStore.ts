import { create } from "zustand";

export type ThemeType = "dark" | "blue" | "yellow" | "green" | "custom";
export type LangType = "zh" | "en";
export type AutoSaveInterval = 0 | 10000 | 30000 | 60000;

export const DEFAULT_STICKY_OPACITY = 85;
export const MIN_STICKY_OPACITY = 0;
export const MAX_STICKY_OPACITY = 100;

/** Recycle bin retention. 0 disables the recycle bin, -1 keeps notes forever. */
export const TRASH_RETENTION_DISABLED = 0;
export const TRASH_RETENTION_FOREVER = -1;
export const DEFAULT_TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_OPTIONS = [
  TRASH_RETENTION_DISABLED,
  7,
  30,
  90,
  TRASH_RETENTION_FOREVER,
] as const;

export function normalizeTrashRetentionDays(value: unknown): number {
  if (value === TRASH_RETENTION_FOREVER) return TRASH_RETENTION_FOREVER;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TRASH_RETENTION_DAYS;
  }
  const days = Math.floor(value);
  if (days <= 0) return TRASH_RETENTION_DISABLED;
  return days;
}

export function normalizeStickyOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STICKY_OPACITY;
  }
  return Math.min(MAX_STICKY_OPACITY, Math.max(MIN_STICKY_OPACITY, Math.round(value)));
}

export interface CustomColors {
  bgPrimary: string;
  bgSecondary: string;
  bgSidebar: string;
  textPrimary: string;
  accent: string;
}

export interface SavedPreset {
  name: string;
  colors: CustomColors;
}

export interface AppShortcuts {
  toggleWindow: string;
}

export const DEFAULT_SHORTCUTS: AppShortcuts = {
  toggleWindow: "Ctrl+Space",
};

/**
 * Share of the sidebar column taken by the category panel, or `null` when the
 * user never dragged it (automatic default). Stored as a ratio instead of pixels
 * so the split keeps its proportion when the window is resized.
 */
export function normalizeSidebarCategoryRatio(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 1) return null;
  return Math.round(value * 10000) / 10000;
}

/**
 * Folder ids expanded in the note tree. `null` means "never touched yet" and the
 * tree falls back to expanding every folder; an empty array means "all folded".
 */
export function normalizeExpandedFolderIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string")));
}

// Preset theme colors for syncing to custom palette
export const THEME_COLORS: Record<Exclude<ThemeType, "custom">, CustomColors> = {
  dark: { bgPrimary: "#1a1b1e", bgSecondary: "#25262b", bgSidebar: "#1e1f23", textPrimary: "#e9ecef", accent: "#5c7cfa" },
  blue: { bgPrimary: "#f0f4f8", bgSecondary: "#e2e8f0", bgSidebar: "#dbe4ef", textPrimary: "#1e293b", accent: "#2563eb" },
  yellow: { bgPrimary: "#faf6ec", bgSecondary: "#f2ecdc", bgSidebar: "#ebe5d2", textPrimary: "#4a4030", accent: "#c4a24a" },
  green: { bgPrimary: "#f4faf6", bgSecondary: "#e8f2ec", bgSidebar: "#deeadf", textPrimary: "#2a4a38", accent: "#4aaa6a" },
};

interface SettingsState {
  theme: ThemeType;
  lang: LangType;
  customColors: CustomColors | null;
  customBackground: string | null;
  savedPresets: SavedPreset[];
  shortcuts: AppShortcuts;
  autoSaveInterval: AutoSaveInterval;
  stickyOpacity: number;
  trashRetentionDays: number;
  showWorkspaceHighlights: boolean;
  alwaysOnTop: boolean;
  updateReminderDisabledForVersion: string | null;
  sidebarCategoryRatio: number | null;
  expandedFolderIds: string[] | null;
  setTheme: (theme: ThemeType) => void;
  setLang: (lang: LangType) => void;
  setCustomColors: (colors: CustomColors) => void;
  setCustomBackground: (filename: string | null) => void;
  savePreset: (name: string) => void;
  loadPreset: (index: number) => void;
  deletePreset: (index: number) => void;
  setShortcuts: (shortcuts: AppShortcuts) => void;
  setAutoSaveInterval: (interval: AutoSaveInterval) => void;
  setStickyOpacity: (opacity: number) => void;
  setTrashRetentionDays: (days: number) => void;
  setShowWorkspaceHighlights: (show: boolean) => void;
  setAlwaysOnTop: (alwaysOnTop: boolean) => void;
  setUpdateReminderDisabledForVersion: (version: string | null) => void;
  setSidebarCategoryRatio: (ratio: number | null) => void;
  setExpandedFolderIds: (ids: string[] | null) => void;
  loadSettings: (settings: {
    theme?: ThemeType;
    lang?: LangType;
    customColors?: CustomColors | null;
    customBackground?: string | null;
    savedPresets?: SavedPreset[];
    shortcuts?: AppShortcuts;
    autoSaveInterval?: AutoSaveInterval;
    stickyOpacity?: number;
    trashRetentionDays?: number;
    showWorkspaceHighlights?: boolean;
    alwaysOnTop?: boolean;
    updateReminderDisabledForVersion?: string | null;
    sidebarCategoryRatio?: number | null;
    expandedFolderIds?: string[] | null;
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "blue",
  lang: "zh",
  customColors: null,
  customBackground: null,
  savedPresets: [],
  shortcuts: DEFAULT_SHORTCUTS,
  autoSaveInterval: 0,
  stickyOpacity: DEFAULT_STICKY_OPACITY,
  trashRetentionDays: DEFAULT_TRASH_RETENTION_DAYS,
  showWorkspaceHighlights: true,
  alwaysOnTop: false,
  updateReminderDisabledForVersion: null,
  sidebarCategoryRatio: null,
  expandedFolderIds: null,

  setTheme: (theme) => {
    // Sync custom palette when clicking a preset
    if (theme !== "custom") {
      set({ theme, customColors: { ...THEME_COLORS[theme] } });
    } else {
      set({ theme });
    }
  },

  setLang: (lang) => set({ lang }),

  setCustomColors: (colors) => set({ customColors: colors, theme: "custom" }),

  setCustomBackground: (customBackground) => set({ customBackground }),

  savePreset: (name) => {
    const { customColors, savedPresets } = get();
    if (!customColors || savedPresets.length >= 5) return;
    set({ savedPresets: [...savedPresets, { name, colors: { ...customColors } }] });
  },

  loadPreset: (index) => {
    const { savedPresets } = get();
    if (index < 0 || index >= savedPresets.length) return;
    set({ customColors: { ...savedPresets[index].colors }, theme: "custom" });
  },

  deletePreset: (index) => {
    const { savedPresets } = get();
    set({ savedPresets: savedPresets.filter((_, i) => i !== index) });
  },

  setShortcuts: (shortcuts) => set({ shortcuts }),

  setAutoSaveInterval: (autoSaveInterval) => set({ autoSaveInterval }),

  setStickyOpacity: (stickyOpacity) => set({ stickyOpacity: normalizeStickyOpacity(stickyOpacity) }),

  setTrashRetentionDays: (days) => set({ trashRetentionDays: normalizeTrashRetentionDays(days) }),

  setShowWorkspaceHighlights: (showWorkspaceHighlights) => set({ showWorkspaceHighlights }),

  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),

  setUpdateReminderDisabledForVersion: (updateReminderDisabledForVersion) => set({ updateReminderDisabledForVersion }),

  setSidebarCategoryRatio: (ratio) => set({ sidebarCategoryRatio: normalizeSidebarCategoryRatio(ratio) }),

  setExpandedFolderIds: (ids) => set({ expandedFolderIds: normalizeExpandedFolderIds(ids) }),

  loadSettings: (settings) =>
    set({
      theme: settings.theme || "blue",
      lang: settings.lang || "zh",
      customColors: settings.customColors || null,
      customBackground: settings.customBackground || null,
      savedPresets: settings.savedPresets || [],
      shortcuts: settings.shortcuts || DEFAULT_SHORTCUTS,
      autoSaveInterval: settings.autoSaveInterval || 0,
      stickyOpacity: normalizeStickyOpacity(settings.stickyOpacity),
      trashRetentionDays: normalizeTrashRetentionDays(settings.trashRetentionDays),
      showWorkspaceHighlights: settings.showWorkspaceHighlights ?? true,
      alwaysOnTop: settings.alwaysOnTop === true,
      updateReminderDisabledForVersion: typeof settings.updateReminderDisabledForVersion === "string"
        ? settings.updateReminderDisabledForVersion
        : null,
      sidebarCategoryRatio: normalizeSidebarCategoryRatio(settings.sidebarCategoryRatio),
      expandedFolderIds: normalizeExpandedFolderIds(settings.expandedFolderIds),
    }),
}));
