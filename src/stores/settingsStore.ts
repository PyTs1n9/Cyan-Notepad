import { create } from "zustand";

export type ThemeType = "dark" | "blue" | "yellow" | "green" | "custom";
export type LangType = "zh" | "en";

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
  savedPresets: SavedPreset[];
  setTheme: (theme: ThemeType) => void;
  setLang: (lang: LangType) => void;
  setCustomColors: (colors: CustomColors) => void;
  savePreset: (name: string) => void;
  loadPreset: (index: number) => void;
  deletePreset: (index: number) => void;
  loadSettings: (settings: {
    theme?: ThemeType;
    lang?: LangType;
    customColors?: CustomColors | null;
    savedPresets?: SavedPreset[];
  }) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "blue",
  lang: "zh",
  customColors: null,
  savedPresets: [],

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

  loadSettings: (settings) =>
    set({
      theme: settings.theme || "blue",
      lang: settings.lang || "zh",
      customColors: settings.customColors || null,
      savedPresets: settings.savedPresets || [],
    }),
}));
