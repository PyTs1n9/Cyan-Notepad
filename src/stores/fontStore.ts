import { create } from "zustand";
import type { AppFont } from "@/types";

interface FontState {
  fonts: AppFont[];
  addFont: (font: AppFont) => void;
  loadFonts: (fonts: AppFont[]) => void;
  getFontFamilies: () => string[];
}

const DEFAULT_FONTS: AppFont[] = [
  { name: "系统默认", family: "Segoe UI", path: "" },
  { name: "微软雅黑", family: "Microsoft YaHei", path: "" },
  { name: "宋体", family: "SimSun", path: "" },
  { name: "楷体", family: "KaiTi", path: "" },
];

export const useFontStore = create<FontState>((set, get) => ({
  fonts: [...DEFAULT_FONTS],

  addFont: (font) =>
    set((state) => ({
      fonts: [...state.fonts, font],
    })),

  loadFonts: (fonts) =>
    set({ fonts: [...DEFAULT_FONTS, ...fonts] }),

  getFontFamilies: () => get().fonts.map((f) => f.family),
}));
