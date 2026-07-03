/**
 * @lucentive-labs/loupe-dom — vanilla browser renderer for Loupe.
 *
 *  - `mount(el, config, opts?)`  live interactive decision-lock UI
 *  - `renderToString(config, state?)`  deterministic SSR / static markup
 *  - `applyTheme(el, tokens)`  set --loupe-* CSS variables on an element
 *  - `styles.css`  part styles + default theme (import separately)
 */
import type { Config } from "@lucentive-labs/loupe-schema";
import {
  type Selections,
  recommendedSelections,
  tokensToCssText,
} from "@lucentive-labs/loupe-core";
import { renderApp } from "./render.js";

export { mount, applyTheme } from "./mount.js";
export type { MountOptions, LoupeInstance } from "./mount.js";
export {
  renderApp,
  renderGroup,
  renderTile,
  renderSpecimen,
  renderComposedPreview,
  renderExportBrief,
  renderStack,
  TILE_AR,
} from "./render.js";

/**
 * Deterministic SSR / static render. No Date, no random, config order
 * preserved. When `state` is omitted, the recommended selections are used
 * (matching the store's server snapshot) so SSR and hydration agree.
 *
 * The returned string is the app markup. To make it self-styling, prepend the
 * theme `<style>` (see `renderToString({ includeTheme: true })`) and import the
 * package `styles.css` for the part styles.
 */
export function renderToString(
  config: Config,
  state?: Selections,
  opts: { includeTheme?: boolean } = {},
): string {
  const sel = state ?? recommendedSelections(config);
  const app = renderApp(config, sel);
  if (opts.includeTheme) {
    return `<style data-loupe-theme>\n${tokensToCssText(config.theme)}\n</style>\n${app}`;
  }
  return app;
}
