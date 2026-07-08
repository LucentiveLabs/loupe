/**
 * @lucentive-labs/loupe-generator — Node-only static-HTML generator.
 *
 * `generate(config, { outDir, assetsDir? })` validates the config, copies
 * referenced assets next to the artifact, bundles a tiny browser entry (that
 * mounts the Loupe UI) into ONE self-contained `index.html` with JS + CSS
 * inlined, and rewrites asset URLs so the file works under `file://` and a
 * static server. Output is deterministic.
 */
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  type Config,
  parseConfig,
  validateConfig,
} from "@lucentive-labs/loupe-schema";
import {
  DEFAULT_TOKENS,
  type Selections,
  escapeHtml,
  safeUrl,
  tokensToCssText,
} from "@lucentive-labs/loupe-core";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export interface GenerateOptions {
  /** Directory the artifact (index.html + assets/) is written to. */
  outDir: string;
  /**
   * Directory referenced asset `src` values are resolved against when they are
   * relative. Defaults to the current working directory.
   */
  assetsDir?: string;
  /**
   * Initial selections embedded in the artifact (overrides storage +
   * recommended). Omit to let the runtime fall back to persisted state
   * (`storageKey`), then the recommended picks.
   */
  initial?: Selections;
  /** localStorage key for persistence inside the artifact. Omit = ephemeral. */
  storageKey?: string;
  /**
   * Theme-token overrides merged over `config.theme` (which itself merges over
   * the built-in defaults). Lets a caller re-skin the artifact programmatically
   * from a project's resolved design tokens without editing the config.
   */
  theme?: Config["theme"];
  /**
   * Favicon for the artifact. Defaults to the standard Loupe aperture mark;
   * pass a data URI / URL to override, or `false` to omit the icon link.
   */
  favicon?: string | false;
  /**
   * Presentation layout override: "flow" (guided stepper) or "page" (dense
   * scroll). Falls back to `config.layout`, then the "flow" default.
   */
  layout?: "flow" | "page";
}

export interface GenerateResult {
  /** Absolute path to the written index.html. */
  htmlPath: string;
  /** Absolute paths of copied asset files. */
  assets: string[];
  /** The HTML string (also written to disk). */
  html: string;
}

/** Locate loupe-dom's styles.css across source (tsx) and built (dist) layouts. */
function resolveStylesCss(): string {
  const candidates: string[] = [];
  try {
    // Resolve the package entry, then its sibling styles.css.
    const pkgMain = require.resolve("@lucentive-labs/loupe-dom");
    candidates.push(path.join(path.dirname(pkgMain), "styles.css"));
  } catch {
    /* fall through to path guesses */
  }
  candidates.push(
    path.resolve(here, "../../loupe-dom/src/styles.css"),
    path.resolve(here, "../../loupe-dom/dist/styles.css"),
  );
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  }
  throw new Error(
    `Could not locate loupe-dom styles.css (tried: ${candidates.join(", ")})`,
  );
}

/** Locate the browser entry source for esbuild. */
function resolveBrowserEntry(): string {
  const candidates = [
    path.resolve(here, "browser-entry.ts"),
    path.resolve(here, "browser-entry.js"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(
    `Could not locate browser-entry (tried: ${candidates.join(", ")})`,
  );
}

/** Deterministic, collision-safe asset filename from a source path. */
function assetFilename(srcPath: string, used: Set<string>): string {
  const base = path.basename(srcPath);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let i = 2;
  let name = `${stem}-${i}${ext}`;
  while (used.has(name)) {
    i += 1;
    name = `${stem}-${i}${ext}`;
  }
  used.add(name);
  return name;
}

/** Standard Loupe favicon (aperture mark) inlined so every artifact ships one. */
const LOUPE_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='10.5' fill='none' stroke='#2FD4C4' stroke-width='3'/><circle cx='16' cy='16' r='3.25' fill='#2FD4C4'/></svg>",
)}`;

/** Font families that ship with the OS / CSS — never fetched from a web host. */
const SYSTEM_FONT_FAMILIES = new Set([
  "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
  "sans-serif", "serif", "monospace", "-apple-system", "blinkmacsystemfont",
  "segoe ui", "helvetica", "helvetica neue", "arial", "georgia",
  "times new roman", "times", "courier new", "courier", "menlo", "monaco",
  "consolas", "sfmono-regular", "liberation mono", "cantarell",
  "apple color emoji", "segoe ui emoji", "emoji", "math",
]);

/** First family in a CSS font stack, unquoted (for host lookup / matching). */
function firstFamily(stack?: string): string | undefined {
  const first = stack?.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return first || undefined;
}

/**
 * Emit web-font <link>s derived from the theme's `font-*` tokens instead of a
 * hardcoded family. System/preinstalled families are skipped; the rest are
 * requested from Google Fonts (best effort — an unhosted family simply falls
 * back to its stack). Returns "" when every family is a system stack.
 */
function fontLinks(theme?: Config["theme"]): string {
  const tokens = { ...DEFAULT_TOKENS, ...(theme ?? {}) };
  const families: string[] = [];
  for (const key of ["font-sans", "font-serif", "font-mono", "font-display"] as const) {
    const fam = firstFamily(tokens[key]);
    if (!fam || SYSTEM_FONT_FAMILIES.has(fam.toLowerCase())) continue;
    if (!families.includes(fam)) families.push(fam);
  }
  if (families.length === 0) return "";
  // One <link> per family: the css2 endpoint 400s the WHOLE request on any
  // missing (family, weight) pair, so a combined request lets one family take
  // down the rest. wght@400;700 (regular + bold) is near-universally available.
  const links = families.map(
    (f) =>
      `    <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800&display=swap" rel="stylesheet" />`,
  );
  return [
    `    <link rel="preconnect" href="https://fonts.googleapis.com" />`,
    `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
    ...links,
  ].join("\n");
}

function htmlTemplate(args: {
  config: Config;
  initial?: Selections;
  storageKey?: string;
  css: string;
  js: string;
  favicon?: string | false;
}): string {
  const { config, initial, storageKey, css, js, favicon } = args;
  const title = escapeHtml(config.title ?? "Loupe decision lock");
  const themeCss = tokensToCssText(config.theme);
  const fontHead = fontLinks(config.theme);
  const faviconHref = favicon === false ? null : favicon || LOUPE_FAVICON;
  const faviconLink = faviconHref ? `    <link rel="icon" href="${escapeHtml(faviconHref)}" />` : "";
  // JSON embeds — guard against </script> breakout by escaping the slash.
  const safeJson = (v: unknown) =>
    JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const storageLine = storageKey
    ? `window.__LOUPE_STORAGE_KEY__ = ${safeJson(storageKey)};`
    : "";
  // Only embed an explicit initial: mount()'s `initial` overrides storage, so
  // unconditionally baking in the recommended picks would defeat storageKey
  // persistence across reloads. Without it the store falls back to
  // storage -> recommended on its own.
  const initialLine =
    initial !== undefined
      ? `window.__LOUPE_INITIAL__ = ${safeJson(initial)};`
      : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
${faviconLink}
${fontHead}
    <style>
${css}
    </style>
    <style>
${themeCss}
    </style>
  </head>
  <body>
    <div id="loupe-app"></div>
    <script>
      window.__LOUPE_CONFIG__ = ${safeJson(config)};
      ${initialLine}
      ${storageLine}
    </script>
    <script>
${js}
    </script>
  </body>
</html>
`;
}

/** Generate the self-contained artifact. */
export async function generate(
  rawConfig: unknown,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  // 1) Validate (structural + semantic). Throw on any error.
  const config = parseConfig(rawConfig);
  const errs = validateConfig(config);
  if (errs.length) {
    throw new Error(`Invalid Loupe config:\n- ${errs.join("\n- ")}`);
  }

  const outDir = path.resolve(opts.outDir);
  const assetsBase = path.resolve(opts.assetsDir ?? process.cwd());
  const outAssetsDir = path.join(outDir, "assets");
  fs.mkdirSync(outAssetsDir, { recursive: true });

  // 2) Copy referenced assets deterministically and rewrite src -> assets/<file>.
  const used = new Set<string>();
  const copied: string[] = [];
  const rewritten: Config["assets"] = {};
  // Iterate asset keys in sorted order for deterministic filename assignment.
  for (const key of Object.keys(config.assets).sort()) {
    const asset = config.assets[key]!;
    const srcRaw = asset.src;
    // Leave already-remote URLs untouched (can't bundle them).
    if (/^https?:\/\//i.test(srcRaw)) {
      rewritten[key] = { ...asset };
      continue;
    }
    const absSrc = path.isAbsolute(srcRaw)
      ? srcRaw
      : path.resolve(assetsBase, srcRaw);
    if (!fs.existsSync(absSrc)) {
      throw new Error(
        `Asset "${key}" source not found: ${srcRaw} (resolved ${absSrc})`,
      );
    }
    const fname = assetFilename(absSrc, used);
    const dest = path.join(outAssetsDir, fname);
    fs.copyFileSync(absSrc, dest);
    copied.push(dest);
    rewritten[key] = { ...asset, src: `assets/${fname}` };
  }
  // Merge opts.theme over config.theme, dropping non-string (e.g. undefined)
  // values so a JS caller can't emit `--loupe-x: undefined` or desync the
  // embedded __LOUPE_CONFIG__ (JSON.stringify silently drops undefined).
  const rawTheme = { ...(config.theme ?? {}), ...(opts.theme ?? {}) };
  const cleanTheme = Object.fromEntries(
    Object.entries(rawTheme).filter(([, v]) => typeof v === "string"),
  );
  const mergedTheme = Object.keys(cleanTheme).length ? cleanTheme : undefined;
  const artifactConfig: Config = {
    ...config,
    theme: mergedTheme,
    layout: opts.layout ?? config.layout,
    assets: rewritten,
  };

  // 3) Bundle the browser entry to a single IIFE (in-memory).
  const result = await build({
    entryPoints: [resolveBrowserEntry()],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const js = result.outputFiles[0]?.text ?? "";
  if (!js) throw new Error("esbuild produced no output for the browser entry");

  // 4) Inline CSS + JS into a deterministic HTML template. `initial` is only
  // embedded when the caller provided one (see htmlTemplate) — the runtime
  // store already defaults to storage -> recommended.
  const css = resolveStylesCss();
  const html = htmlTemplate({
    config: artifactConfig,
    initial: opts.initial,
    storageKey: opts.storageKey,
    css,
    js,
    favicon: opts.favicon,
  });

  const htmlPath = path.join(outDir, "index.html");
  fs.writeFileSync(htmlPath, html, "utf8");

  return { htmlPath, assets: copied, html };
}

// Re-export small utilities consumers occasionally want alongside generate().
export { safeUrl };
export { serveCapture } from "./capture.js";
export { themeFromDesign, themeFromDesignDir, parseFrontmatter } from "./design-theme.js";
export type { Config, Selections };
export type { CaptureOptions, CaptureServer, CapturedBrief } from "./capture.js";
export type { ResolvedTheme } from "./design-theme.js";
