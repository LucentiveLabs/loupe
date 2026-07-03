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
 * own slugs, so we resolve each `--loupe-*` role from a priority list of common
 * slugs and report `warnings` for any role that found no source (kept default).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Config } from "@lucentive-labs/loupe-schema";

type Theme = NonNullable<Config["theme"]>;
type FmNode = string | { [k: string]: FmNode };

export interface ResolvedTheme {
  /** The `--loupe-*` token overrides (kebab keys without the prefix). */
  theme: Theme;
  /** Human-readable notes on roles that found no source (and kept the default). */
  warnings: string[];
}

/**
 * Parse the YAML frontmatter of a Stitch `DESIGN.md` into nested objects.
 * Supports the subset the format uses: `---`-delimited frontmatter, `key: value`
 * scalars, `key:` map openers, 2-space nesting, and quoted or unquoted scalars.
 * Lines without a colon (e.g. list items) and comments are ignored.
 */
export function parseFrontmatter(md: string): Record<string, FmNode> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m || !m[1]) return {};
  const root: Record<string, FmNode> = {};
  const stack: Array<{ indent: number; obj: Record<string, FmNode> }> = [{ indent: -1, obj: root }];
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const ci = line.indexOf(":");
    if (ci < 0) continue; // list items / non-map lines: not needed for tokens
    const key = unquote(line.slice(0, ci).trim());
    const val = line.slice(ci + 1).trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.obj;
    if (val === "") {
      const child: Record<string, FmNode> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = unquote(val);
    }
  }
  return root;
}

const unquote = (s: string): string => s.replace(/^['"]|['"]$/g, "");
const asMap = (n: FmNode | undefined): Record<string, FmNode> =>
  n && typeof n === "object" ? n : {};
const asStr = (n: FmNode | undefined): string | undefined =>
  typeof n === "string" && n.length > 0 ? n : undefined;

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

  // Resolve a color role from the first matching slug (DESIGN.md, then design.json canonical).
  const color = (...slugs: string[]): string | undefined => {
    for (const s of slugs) {
      const v = asStr(colors[s]) ?? metaHex(input.designJson, s);
      if (v) return v;
    }
    return undefined;
  };
  // Resolve a font family from a typography role (role may be a map with
  // `fontFamily`, or a bare string).
  const font = (...roles: string[]): string | undefined => {
    for (const r of roles) {
      const node = typo[r];
      const v = asStr(node) ?? asStr(asMap(node).fontFamily);
      if (v) return v;
    }
    return undefined;
  };

  // The role map. `color-primary` is the STRUCTURAL near-black (text/buttons) —
  // usually a project's `ink`; `color-signal` is the ACCENT — usually a
  // project's `primary`/`accent` (design systems commonly name the accent
  // "primary", which is NOT Loupe's structural primary).
  const map: Array<[token: string, value: string | undefined, role: string]> = [
    ["color-bg", color("bg", "background", "surface-wash", "surface-mist", "mist", "canvas"), "background"],
    ["color-surface", color("surface", "card", "paper", "surface-1", "elevated"), "surface"],
    ["color-fg", color("ink", "foreground", "fg", "text", "on-surface"), "foreground text"],
    ["color-fg-muted", color("ink-secondary", "fg-muted", "muted", "text-muted", "ink-tertiary", "subtle"), "muted text"],
    ["color-primary", color("ink", "foreground", "fg", "text-strong", "on-surface"), "structural primary"],
    ["color-primary-fg", color("surface", "bg", "paper", "on-primary", "background"), "text-on-primary"],
    ["color-border", color("border", "border-quiet", "outline", "hairline", "divider"), "border"],
    ["color-ring", color("ring", "focus", "focus-ring", "primary", "accent", "brand"), "focus ring"],
    ["color-danger", color("danger", "error", "destructive", "critical", "red"), "danger"],
    ["color-signal", color("primary", "accent", "brand", "signal", "highlight"), "signal accent"],
  ];
  for (const [token, value, role] of map) {
    if (value) theme[token] = value;
    else warnings.push(`no source for --loupe-${token} (${role}); kept default`);
  }

  const fontSans = font("body", "sans", "base", "default");
  const fontSerif = font("serif", "display", "heading");
  const fontMono = font("mono", "code", "monospace");
  if (fontSans) theme["font-sans"] = fontSans;
  else warnings.push("no source for --loupe-font-sans (body/sans); kept default");
  if (fontSerif) theme["font-serif"] = fontSerif;
  if (fontMono) theme["font-mono"] = fontMono;

  const rSm = asStr(rounded.sm) ?? asStr(rounded.small);
  const rMd = asStr(rounded.md) ?? asStr(rounded.medium) ?? asStr(rounded.base);
  const rLg = asStr(rounded.lg) ?? asStr(rounded.large) ?? asStr(rounded.card) ?? asStr(rounded.xl);
  if (rSm) theme["radius-sm"] = rSm;
  if (rMd) theme["radius-md"] = rMd;
  if (rLg) theme["radius-lg"] = rLg;

  if (!input.designMd && !input.designJson)
    warnings.push("no DESIGN.md or design.json provided; theme is empty (all defaults)");
  return { theme, warnings };
}

/**
 * Resolve a Loupe theme from a project directory: reads `DESIGN.md` (root) and
 * an optional `.impeccable/design.json`. Feed the result to
 * `generate(config, { theme })`.
 */
export function themeFromDesignDir(dir: string): ResolvedTheme {
  const mdPath = ["DESIGN.md", "design.md"]
    .map((f) => path.join(dir, f))
    .find((p) => fs.existsSync(p));
  const jsonPath = path.join(dir, ".impeccable", "design.json");
  const designMd = mdPath ? fs.readFileSync(mdPath, "utf8") : undefined;
  let designJson: unknown;
  if (fs.existsSync(jsonPath)) {
    try {
      designJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (e) {
      return { theme: {}, warnings: [`could not parse ${jsonPath}: ${String(e)}`] };
    }
  }
  return themeFromDesign({ designMd, designJson });
}
