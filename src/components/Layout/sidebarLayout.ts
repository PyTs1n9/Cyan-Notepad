import type { LangType } from "@/stores/settingsStore";

// Keep every resizable sidebar compact and consistent. The label threshold is
// separate so action text can stay hidden until there is enough room.
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 400;

// Dragging narrower than this collapses the sidebar instead of clamping it at
// SIDEBAR_MIN_WIDTH, and the same threshold brings it back, so the boundary is
// deterministic in both directions. The 60px between this and the minimum is the
// travel the pointer needs past the clamped width before the sidebar goes away,
// which keeps accidental collapses rare. The flip itself is animated (see
// `.sidebar-collapse-anim` in index.css) so the panel never vanishes in one frame.
export const SIDEBAR_COLLAPSE_THRESHOLD = 180;

/** Resolve a pointer position into the width the sidebar should preview. */
export function resolveSidebarWidth(pointerX: number, activityBarWidth: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, pointerX - activityBarWidth));
}

/** True when the pointer has crossed far enough left to collapse the sidebar. */
export function isBelowSidebarCollapseThreshold(
  pointerX: number,
  activityBarWidth: number,
): boolean {
  return pointerX - activityBarWidth < SIDEBAR_COLLAPSE_THRESHOLD;
}

export const SIDEBAR_LABEL_MIN_WIDTH: Record<LangType, number> = {
  zh: 296,
  en: 372,
};

// Category panel sizing. The panel is measured in rows so its default height
// tracks the row rhythm of the list instead of a magic pixel value, then capped
// by a share of the available column height so the note list always survives.
export const CATEGORY_ROWS_DEFAULT = 11;
export const CATEGORY_ROWS_MIN = 2;
export const CATEGORY_ROW_HEIGHT_REM = 1.75;
export const CATEGORY_ROW_GAP_REM = 0.125;
// Never let the category panel squeeze the note list below a usable height.
export const CATEGORY_MIN_NOTE_AREA_PX = 168;

export interface CategoryPanelMetrics {
  /** Height of one category row in px. */
  rowPx: number;
  /** Vertical gap between two category rows in px. */
  gapPx: number;
  minPx: number;
  maxPx: number;
  autoPx: number;
}

export function getRootFontSize(): number {
  if (typeof window === "undefined") return 16;
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

export function rowsToHeight(rows: number, rootFontSize: number): number {
  const rowPx = CATEGORY_ROW_HEIGHT_REM * rootFontSize;
  const gapPx = CATEGORY_ROW_GAP_REM * rootFontSize;
  return rows * rowPx + Math.max(0, rows - 1) * gapPx;
}

export function getCategoryPanelMetrics(
  regionHeight: number,
  rootFontSize = 16,
): CategoryPanelMetrics {
  const rowPx = CATEGORY_ROW_HEIGHT_REM * rootFontSize;
  const gapPx = CATEGORY_ROW_GAP_REM * rootFontSize;
  const minPx = rowsToHeight(CATEGORY_ROWS_MIN, rootFontSize);
  // A zero region height means "not measured yet"; fall back to the row default
  // instead of clamping against a meaningless negative budget.
  const measured = regionHeight > 0;
  const maxPx = measured
    ? Math.max(minPx, regionHeight - CATEGORY_MIN_NOTE_AREA_PX)
    : rowsToHeight(CATEGORY_ROWS_DEFAULT, rootFontSize);
  // Default to the familiar 11 rows and only shrink when the window is too
  // short to keep the note list usable.
  const autoPx = Math.min(rowsToHeight(CATEGORY_ROWS_DEFAULT, rootFontSize), maxPx);
  return { rowPx, gapPx, minPx, maxPx, autoPx };
}

export function clampCategoryPanelHeight(
  height: number,
  metrics: CategoryPanelMetrics,
): number {
  if (!Number.isFinite(height)) return metrics.autoPx;
  return Math.min(metrics.maxPx, Math.max(metrics.minPx, height));
}

/**
 * Snap a height to a whole number of rows. The panel always shows complete
 * rows, so a dragged edge never leaves a half-cut category behind.
 */
export function snapCategoryPanelHeight(
  height: number,
  metrics: CategoryPanelMetrics,
): number {
  const { gapPx } = metrics;
  const pitch = metrics.rowPx + gapPx;
  if (!Number.isFinite(height) || pitch <= 0) return clampCategoryPanelHeight(height, metrics);
  const rowsFromHeight = (px: number) => (px + gapPx) / pitch;
  let rows = Math.max(CATEGORY_ROWS_MIN, Math.round(rowsFromHeight(height)));
  let snapped = rows * pitch - gapPx;
  if (snapped > metrics.maxPx) {
    rows = Math.floor(rowsFromHeight(metrics.maxPx));
    snapped = rows * pitch - gapPx;
  }
  return Math.min(metrics.maxPx, Math.max(metrics.minPx, snapped));
}

/**
 * Resolve the panel height for a given region height.
 *
 * - `ratio === null` (never dragged) keeps the automatic default, so the panel
 *   follows the window instead of sticking to one pixel value.
 * - A stored ratio scales with the region, so resizing the window keeps the
 *   user's chosen proportion rather than their old pixel height.
 */
export function resolveCategoryPanelHeight(
  regionHeight: number,
  ratio: number | null,
  rootFontSize = 16,
): number {
  const metrics = getCategoryPanelMetrics(regionHeight, rootFontSize);
  if (ratio === null) return snapCategoryPanelHeight(metrics.autoPx, metrics);
  const basis = regionHeight > 0 ? regionHeight : metrics.autoPx;
  return snapCategoryPanelHeight(ratio * basis, metrics);
}
