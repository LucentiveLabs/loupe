/**
 * @lucentive-labs/loupe-generator — resolve a project's design tokens into a
 * Loupe theme, so a generated artifact wears the target project's skin instead
 * of the neutral default.
 *
 * Reads the open Google **Stitch `DESIGN.md`** frontmatter (colors / typography
 * / rounded) and, optionally, an Impeccable-style **`.impeccable/design.json`**
 * sidecar (canonical colors) as enrichment. No YAML dependency — a small parser
 * handles the Stitch frontmatter shape (nested 2-space maps of scalar values).
 *
 * The mapping is a best-effort **role map**: a project names its tokens with its
 * own slugs, so each `--loupe-*` role is resolved from a priority list of common
 * slugs (covering both Impeccable- and Material-3-style systems). Values are
 * validated by token type (colors must be colors, radii must be dimensions,
 * font stacks must be safe); anything invalid or unsourced is dropped with a
 * warning and Loupe's default is kept.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "@lucentive-labs/loupe-schema";

type Theme = NonNullable<Config["theme"]>;
type FmNode = string | { [k: string]: FmNode };

export interface ResolvedTheme {
  /** The `--loupe-*` token overrides (kebab keys without the prefix). */
  theme: Theme;
  /** Notes on roles that found no valid source (and kept the default). */
  warnings: string[];
}

const unquote = (s: string): string => s.replace(/^['"]|['"]$/g, "");

/**
 * Extract a scalar value: quoted content (ignoring any trailing inline comment),
 * or an unquoted value with a trailing ` # comment` stripped — a leading `#`
 * (as in an unquoted hex color) is preserved.
 */
function scalarValue(raw: string): string {
  const q = raw[0];
  if (q === '"' || q === "'") {
    const end = raw.indexOf(q, 1);
    return end > 0 ? raw.slice(1, end) : raw.slice(1);
  }
  const cm = raw.search(/\s#/);
  return (cm >= 0 ? raw.slice(0, cm) : raw).trim();
}

/**
 * Parse the YAML frontmatter of a Stitch `DESIGN.md` into nested objects.
 * Supports the subset the format uses: `---`-delimited frontmatter, `key: value`
 * scalars, `key:` map openers, 2-space nesting, quoted/unquoted scalars. Comment
 * lines and `- ` list items are ignored.
 */
export function parseFrontmatter(md: string): Record<string, FmNode> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m || !m[1]) return {};
  const root: Record<string, FmNode> = {};
  const stack: Array<{ indent: number; obj: Record<string, FmNode> }> = [{ indent: -1, obj: root }];
  for (const rawLine of m[1].split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("- ")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const ci = trimmed.indexOf(":");
    if (ci < 0) continue;
    const key = unquote(trimmed.slice(0, ci).trim());
    const rest = trimmed.slice(ci + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.obj;
    if (rest === "") {
      const child: Record<string, FmNode> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = scalarValue(rest);
    }
  }
  return root;
}

const asMap = (n: FmNode | undefined): Record<string, FmNode> => (n && typeof n === "object" ? n : {});
const asStr = (n: FmNode | undefined): string | undefined => (typeof n === "string" && n.length > 0 ? n : undefined);

// --- token-type-aware value validation (also blocks resource fetches) ---
const URLISH = /\b(url|image|image-set|-webkit-image-set|cross-fade|element|expression)\s*\(/i;
const BREAKOUT = /[<>{};@\\]/;
const COLOR_FN = /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\s*\(/i;
const isColor = (v: string): boolean =>
  !URLISH.test(v) &&
  !BREAKOUT.test(v) &&
  (/^#[0-9a-fA-F]{3,8}$/.test(v) || COLOR_FN.test(v) || /^[a-zA-Z][a-zA-Z-]*$/.test(v));
const isDimension = (v: string): boolean =>
  !URLISH.test(v) &&
  !BREAKOUT.test(v) &&
  (v === "0" ||
    /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt)$/.test(v) ||
    /^(calc|clamp|min|max)\s*\(/i.test(v));
const isFontStack = (v: string): boolean => !URLISH.test(v) && !BREAKOUT.test(v);

/** A design.json colorMeta entry's canonical color, if present. */
function metaHex(designJson: unknown, slug: string): string | undefined {
  const cm = (designJson as { extensions?: { colorMeta?: Record<string, { canonical?: unknown }> } })
    ?.extensions?.colorMeta;
  const c = cm?.[slug]?.canonical;
  return typeof c === "string" && c.length > 0 ? c : undefined;
}

/**
 * Resolve a Loupe theme from a project's DESIGN.md (+ optional design.json).
 * DESIGN.md frontmatter is primary; design.json canonical colors enrich it.
 */
export function themeFromDesign(input: { designMd?: string; designJson?: unknown }): ResolvedTheme {
  const warnings: string[] = [];
  const theme: Theme = {};
  const fm = input.designMd ? parseFrontmatter(input.designMd) : {};
  const colors = asMap(fm.colors);
  const typo = asMap(fm.typography);
  const rounded = asMap(fm.rounded);

  const firstColor = (slugs: readonly string[]): string | undefined => {
    for (const s of slugs) {
      const v = asStr(colors[s]) ?? metaHex(input.designJson, s);
      if (v) return v;
    }
    return undefined;
  };
  const firstFont = (slugs: readonly string[]): string | undefined => {
    for (const r of slugs) {
      const v = asStr(typo[r]) ?? asStr(asMap(typo[r]).fontFamily);
      if (v) return v;
    }
    return undefined;
  };
  const firstRadius = (slugs: readonly string[]): string | undefined => {
    for (const s of slugs) {
      const v = asStr(rounded[s]);
      if (v) return v;
    }
    return undefined;
  };
  const setColor = (token: string, slugs: readonly string[]) => {
    const v = firstColor(slugs);
    if (!v) warnings.push(`--loupe-${token}: no source (${slugs.slice(0, 3).join("/")}…); kept default`);
    else if (!isColor(v)) warnings.push(`--loupe-${token}: "${v}" is not a valid color; dropped`);
    else theme[token] = v;
  };

  // Role map — aliases cover Impeccable-style (project `primary` = accent, `ink`
  // = structural) AND Material-3-style (`tertiary` = accent, `on-surface` = fg,
  // `neutral` = bg). Accent/tertiary win over `primary` for the signal, so a
  // Material `primary` (structural) is not misread as the accent.
  setColor("color-bg", ["bg", "background", "neutral", "canvas", "surface-wash", "mist", "base"]);
  setColor("color-surface", ["surface", "card", "paper", "elevated", "surface-1"]);
  setColor("color-fg", ["ink", "on-surface", "on-background", "foreground", "fg", "text"]);
  setColor("color-fg-muted", ["ink-secondary", "fg-muted", "muted", "text-muted", "on-surface-variant", "secondary", "ink-tertiary", "subtle"]);
  setColor("color-primary", ["ink", "on-surface", "on-background", "foreground", "fg", "text-strong"]);
  setColor("color-primary-fg", ["on-primary", "surface", "paper", "bg", "background"]);
  setColor("color-border", ["border", "border-quiet", "outline", "divider", "hairline"]);
  setColor("color-ring", ["ring", "focus", "focus-ring", "accent", "tertiary", "brand", "primary"]);
  setColor("color-danger", ["danger", "error", "destructive", "critical", "caution", "red"]);
  setColor("color-signal", ["accent", "brand", "signal", "highlight", "tertiary", "primary"]);

  const sans = firstFont(["body", "body-md", "body-lg", "sans", "base", "default", "text"]);
  const serif = firstFont(["serif", "display", "heading", "headline", "h1", "h2"]);
  const mono = firstFont(["mono", "code", "monospace"]);
  if (!sans) warnings.push("--loupe-font-sans: no source (body/sans…); kept default");
  else if (!isFontStack(sans)) warnings.push(`--loupe-font-sans: "${sans}" is not a safe font stack; dropped`);
  else theme["font-sans"] = sans;
  if (serif && isFontStack(serif)) theme["font-serif"] = serif;
  if (mono && isFontStack(mono)) theme["font-mono"] = mono;

  for (const [token, slugs] of [
    ["radius-sm", ["sm", "small", "xs"]],
    ["radius-md", ["md", "medium", "base", "default"]],
    ["radius-lg", ["lg", "large", "card", "xl"]],
  ] as const) {
    const v = firstRadius(slugs);
    if (v && !isDimension(v)) warnings.push(`--loupe-${token}: "${v}" is not a valid size; dropped`);
    else if (v) theme[token] = v;
  }

  if (!input.designMd && !input.designJson)
    warnings.push("no DESIGN.md or design.json provided; theme is empty (all defaults)");
  return { theme, warnings };
}

/**
 * Resolve a Loupe theme from a project directory: reads `DESIGN.md` (root) and
 * an optional `.impeccable/design.json`. Feed the result to
 * `generate(config, { theme })`. A malformed sidecar is treated as enrichment:
 * it is warned about and skipped, and the DESIGN.md still resolves.
 */
export function themeFromDesignDir(dir: string): ResolvedTheme {
  const mdPath = ["DESIGN.md", "design.md"]
    .map((f) => path.join(dir, f))
    .find((p) => fs.existsSync(p));
  const jsonPath = path.join(dir, ".impeccable", "design.json");
  const designMd = mdPath ? fs.readFileSync(mdPath, "utf8") : undefined;
  let designJson: unknown;
  let jsonWarning: string | undefined;
  if (fs.existsSync(jsonPath)) {
    try {
      designJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (e) {
      jsonWarning = `could not parse ${jsonPath} (ignored — enrichment only): ${String(e)}`;
    }
  }
  const res = themeFromDesign({ designMd, designJson });
  if (jsonWarning) res.warnings.unshift(jsonWarning);
  return res;
}
