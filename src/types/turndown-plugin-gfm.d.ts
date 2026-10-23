/**
 * turndown-plugin-gfm ships no type declarations. Only the pieces this app
 * uses are described here: the bundled `gfm` plugin turns `<table>` into a
 * GFM table and also covers strikethrough and task lists.
 */
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}
