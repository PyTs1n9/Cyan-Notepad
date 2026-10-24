import type { LangType } from "@/stores/settingsStore";

// Keep every resizable sidebar compact and consistent. The label threshold is
// separate so action text can stay hidden until there is enough room.
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 400;

// The AI assistant docks to the right edge and shares the left sidebar's
// collapse shell and resize semantics in App.tsx: the shell animates between 0
// and the stored width, a drag handle resizes it within the bounds below, and
// dragging past the collapse threshold hides it. This is the default width a
// fresh launch (or expand) returns to; the panel keeps its natural width inside
// the shell so the slide never reflows the chat.
export const AI_SIDEBAR_WIDTH = 340;
// The right handle drags up to 500 (the left sidebars keep SIDEBAR_MAX_WIDTH).
export const AI_SIDEBAR_MAX_WIDTH = 500;
// The AI panel holds a chat transcript, so its floor is higher than the tree
// sidebars'. At 240 the fixed chrome (avatar + row gap + list gutter + bubble
// padding = 58px) eats a quarter of the panel and CJK text wraps to ~10 glyphs
// per line, which no amount of inner tightening can fix. 280 is the width where
// the tightened transcript below still holds ~15 glyphs per line.
export const AI_SIDEBAR_MIN_WIDTH = 280;
// Kept 60px under the floor, mirroring SIDEBAR_COLLAPSE_THRESHOLD: the pointer
// must travel past the clamped width before the panel goes away, which keeps
// accidental collapses rare.
export const AI_SIDEBAR_COLLAPSE_THRESHOLD = AI_SIDEBAR_MIN_WIDTH - 60;

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

/**
 * The AI sidebar hugs the right edge, so its width is the distance from the
 * pointer to the right of the window. It uses its own floor and ceiling
 * (AI_SIDEBAR_MIN_WIDTH / AI_SIDEBAR_MAX_WIDTH) because a transcript needs more
 * room than a note tree does.
 */
export function resolveRightSidebarWidth(pointerX: number, viewportWidth: number): number {
  return Math.min(AI_SIDEBAR_MAX_WIDTH, Math.max(AI_SIDEBAR_MIN_WIDTH, viewportWidth - pointerX));
}

/** True when the pointer has crossed far enough right to collapse the AI sidebar. */
export function isBelowRightSidebarCollapseThreshold(
  pointerX: number,
  viewportWidth: number,
): boolean {
  return viewportWidth - pointerX < AI_SIDEBAR_COLLAPSE_THRESHOLD;
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
