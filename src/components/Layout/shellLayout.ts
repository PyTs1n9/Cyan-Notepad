/**
 * Geometry of the workspace shell.
 *
 * The main window is three floating cards (left rail + explorer, editor, AI)
 * laid over a gutter. The cards never use a flex `gap`: the sash between two
 * cards *is* the gutter, so a card that closes takes its gutter with it. These
 * constants are the single source of truth shared by App.tsx (inline CSS
 * variables) and the drag math; `index.css` mirrors the same breakpoint for
 * the no-JS fallback.
 */

/** Width of the always-visible icon rail, and the left edge of a sidebar. */
export const ACTIVITY_BAR_WIDTH = 48;

/** Below this viewport width the shell tightens its margin and gutter. */
export const SHELL_BREAKPOINT = 720;

/**
 * Window margin and card-to-card gap.
 *
 * Both breakpoints carry the same numbers today: the shell settled on one tight
 * 6px rhythm, which is also the narrow-screen value, so the breakpoint currently
 * no longer changes the spacing. The pair of constants is kept so a narrower
 * window can be tightened again without re-plumbing `getShellMetrics`.
 *
 * These two stay separate numbers even while equal: `pad` is the window edge
 * margin applied by App.tsx, `gutter` is the physical width of the sash element
 * between cards, and the drag math reads gutter / 2.
 */
export const SHELL_PAD_WIDE = 6;
export const SHELL_PAD_NARROW = 6;
export const SHELL_GUTTER_WIDE = 6;
export const SHELL_GUTTER_NARROW = 6;
/**
 * Vertical space between the title bar and the card row.
 *
 * Deliberately *not* the gutter: the sash between two cards is a drag handle,
 * so gutter and top gap must stay independent — a change here cannot move the
 * side gutters or the sash widths. The values currently mirror `SHELL_PAD_*`
 * so the cards float with the same margin on all four sides; keep them in
 * sync if the pad ever changes.
 */
export const SHELL_TOP_GAP_WIDE = 6;
export const SHELL_TOP_GAP_NARROW = 6;
export const BOX_RADIUS = 10;

export interface ShellMetrics {
  /** Margin between the cards and the window edges (left / right / bottom). */
  pad: number;
  /** Gap between two cards, carried by the sash element itself. */
  gutter: number;
  /** Vertical space above the card row, i.e. below the title bar. */
  topGap: number;
}

export function getShellMetrics(viewportWidth: number): ShellMetrics {
  const narrow = viewportWidth <= SHELL_BREAKPOINT;
  return {
    pad: narrow ? SHELL_PAD_NARROW : SHELL_PAD_WIDE,
    gutter: narrow ? SHELL_GUTTER_NARROW : SHELL_GUTTER_WIDE,
    topGap: narrow ? SHELL_TOP_GAP_NARROW : SHELL_TOP_GAP_WIDE,
  };
}

/**
 * Pointer offset for the left handles, handed to `resolveSidebarWidth` and
 * `isBelowSidebarCollapseThreshold` as their "activity bar width" argument.
 *
 * Every left explorer now shares one sash - the gutter element between the
 * left card and the editor card - so the sidebar starts at that sash's left
 * edge and the pointer sits on its centre: pad + rail + gutter / 2. The
 * workspace view used to own a 5px inline sash inside its own card, which is
 * why this function used to branch on the view.
 */
export function leftSidebarOffset(metrics: ShellMetrics): number {
  return metrics.pad + ACTIVITY_BAR_WIDTH + metrics.gutter / 2;
}

/**
 * Effective right edge of the viewport for the AI panel: the AI card ends at
 * the right margin, and its sash sits half a gutter to the left of that.
 */
export function rightSidebarLimit(viewportWidth: number, metrics: ShellMetrics): number {
  return viewportWidth - metrics.pad - metrics.gutter / 2;
}
