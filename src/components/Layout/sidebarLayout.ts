import type { LangType } from "@/stores/settingsStore";

// Keep every resizable sidebar compact and consistent. The label threshold is
// separate so action text can stay hidden until there is enough room.
export const SIDEBAR_MIN_WIDTH = 240;

export const SIDEBAR_LABEL_MIN_WIDTH: Record<LangType, number> = {
  zh: 296,
  en: 372,
};

