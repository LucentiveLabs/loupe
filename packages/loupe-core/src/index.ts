import type {
  Config,
  TGroup,
  TOption,
  TRect,
  TThemeTokens,
} from "@lucentive-labs/loupe-schema";

/* ------------------------------------------------------------------ *
 * Selection state (single-select per group for v1)
 *
 * The record stays flat: `sel[groupId]` is the locked option id. Per-group
 * free-text write-ins ("something else") live in the SAME record under the
 * reserved `~writeIn:<groupId>` key, so existing persisted state loads
 * unchanged and older readers (which only look up group ids) simply ignore
 * the extra keys. Group ids starting with "~" are rejected by the schema's
 * `validateConfig`, so the namespaces cannot collide.
 * ------------------------------------------------------------------ */

export type Selections = Record<string, string | undefined>;

/** Reserved Selections-key prefix for per-group write-in text. */
export const WRITE_IN_KEY_PREFIX = "~writeIn:";

/** The Selections key holding a group's raw write-in text. */
export function writeInKey(groupId: string): string {
  return `${WRITE_IN_KEY_PREFIX}${groupId}`;
}

/**
 * Whether a group renders + accepts the "something else" write-in. Open groups
 * always do unless the config sets `allowWriteIn: false`; locked groups never
 * do (they are decided context — any stray write-in state is ignored).
 */
export function groupAllowsWriteIn(group: TGroup): boolean {
  return group.locked !== true && group.allowWriteIn !== false;
}

/** A group's effective write-in text: trimmed, "" when blank or not allowed. */
export function selectedWriteIn(group: TGroup, sel: Selections): string {
  if (!groupAllowsWriteIn(group)) return "";
  return sel[writeInKey(group.id)]?.trim() ?? "";
}

export interface StoragePort {
  get(): Selections | null;
  set(s: Selections): void;
}

/** SSR-safe storage port over localStorage; no-ops when unavailable. */
export function localStorageAdapter(key: string): StoragePort {
  const ls = (): Storage | null => {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    get() {
      const s = ls();
      if (!s) return null;
      try {
        const raw = s.getItem(key);
        return raw ? (JSON.parse(raw) as Selections) : null;
      } catch {
        return null;
      }
    },
    set(value) {
      const s = ls();
      if (!s) return;
      try {
        s.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore quota / privacy errors */
      }
    },
  };
}

export interface LoupeStore {
  readonly config: Config;
  /** Stable snapshot reference (changes only when state changes). */
  getSnapshot(): Selections;
  /** Deterministic snapshot for SSR/hydration (recommended selections). */
  getServerSnapshot(): Selections;
  subscribe(listener: () => void): () => void;
  lock(groupId: string, optionId: string): void;
  /** Set the group's free-text write-in (raw). "" removes it. Refused for locked / write-in-suppressed groups. */
  writeIn(groupId: string, value: string): void;
  clear(groupId: string): void; // drops the pick AND the write-in
  reset(): void; // back to recommended
  clearAll(): void; // to blank
}

/** Recommended selection per group: the `recommended` option, else none. */
export function recommendedSelections(config: Config): Selections {
  const sel: Selections = {};
  for (const g of config.groups) {
    const rec = g.options.find((o) => o.recommended);
    sel[g.id] = rec ? rec.id : undefined;
  }
  return sel;
}

export interface CreateStoreOptions {
  storage?: StoragePort;
  initial?: Selections;
}

export function createLoupeStore(
  config: Config,
  opts: CreateStoreOptions = {},
): LoupeStore {
  const server = Object.freeze(recommendedSelections(config));
  const lockedIds = new Set(config.groups.filter((g) => g.locked).map((g) => g.id));
  const writeInIds = new Set(
    config.groups.filter(groupAllowsWriteIn).map((g) => g.id),
  );
  /** Locked groups always hold their recommended pick, whatever the source. */
  const pinLocked = (s: Selections): Selections => {
    if (lockedIds.size === 0) return s;
    const next = { ...s };
    for (const id of lockedIds) next[id] = server[id];
    return next;
  };
  let state: Selections = pinLocked({ ...(opts.initial ?? opts.storage?.get() ?? server) });
  let snapshot: Selections = Object.freeze({ ...state });
  const listeners = new Set<() => void>();

  const commit = (next: Selections) => {
    state = next;
    snapshot = Object.freeze({ ...state });
    opts.storage?.set(state);
    for (const l of listeners) l();
  };

  return {
    config,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => server,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    lock(groupId, optionId) {
      if (lockedIds.has(groupId)) return;
      if (state[groupId] === optionId) return;
      commit({ ...state, [groupId]: optionId });
    },
    writeIn(groupId, value) {
      if (!writeInIds.has(groupId)) return; // locked, suppressed, or unknown
      const key = writeInKey(groupId);
      if ((state[key] ?? "") === value) return;
      if (value === "") {
        const next = { ...state };
        delete next[key];
        commit(next);
      } else {
        commit({ ...state, [key]: value });
      }
    },
    clear(groupId) {
      if (lockedIds.has(groupId)) return;
      const key = writeInKey(groupId);
      if (state[groupId] === undefined && state[key] === undefined) return;
      const next = { ...state, [groupId]: undefined };
      delete next[key];
      commit(next);
    },
    reset() {
      commit({ ...recommendedSelections(config) });
    },
    clearAll() {
      commit(pinLocked({}));
    },
  };
}

/* ------------------------------------------------------------------ *
 * Derivations (pure, deterministic — single source of truth)
 * ------------------------------------------------------------------ */

export function selectedOption(group: TGroup, sel: Selections): TOption | null {
  const id = sel[group.id];
  return id ? (group.options.find((o) => o.id === id) ?? null) : null;
}

/** A group counts as decided with a locked option OR a non-empty write-in. */
export function selectProgress(
  config: Config,
  sel: Selections,
): { locked: number; total: number } {
  let locked = 0;
  for (const g of config.groups) {
    if (sel[g.id] || selectedWriteIn(g, sel)) locked++;
  }
  return { locked, total: config.groups.length };
}

export interface PreviewBandModel {
  slot: string;
  as: string;
  group: TGroup;
  option: TOption | null;
  /** Effective write-in text ("" when none) — a write-in-only band is decided. */
  writeIn: string;
}
export interface PreviewModel {
  headline: string | null;
  bands: PreviewBandModel[];
}

export function selectComposedPreview(
  config: Config,
  sel: Selections,
): PreviewModel {
  const byId = (id: string) => config.groups.find((g) => g.id === id) ?? null;
  let bands: PreviewBandModel[];
  if (config.preview) {
    bands = config.preview.bands.flatMap((b) => {
      const group = byId(b.fromGroup);
      if (!group) return [];
      return [
        {
          slot: b.slot,
          as: b.as ?? "band",
          group,
          option: selectedOption(group, sel),
          writeIn: selectedWriteIn(group, sel),
        },
      ];
    });
  } else {
    bands = config.groups.map((g) => ({
      slot: g.id,
      as: "band",
      group: g,
      option: selectedOption(g, sel),
      writeIn: selectedWriteIn(g, sel),
    }));
  }
  const headlineGroup = config.preview?.headlineFrom
    ? byId(config.preview.headlineFrom)
    : (config.groups.find((g) =>
        g.options.some((o) => o.specimen.kind === "type"),
      ) ?? null);
  const ho = headlineGroup ? selectedOption(headlineGroup, sel) : null;
  const headline =
    ho && ho.specimen.kind === "type"
      ? ho.specimen.sample
      : ho && ho.specimen.kind === "decision"
        ? ho.specimen.summary
        : null;
  return { headline, bands };
}

export interface ExportBrief {
  markdown: string;
  json: Record<string, unknown>;
}

/** Deterministic: config order, no timestamps / absolute paths. */
export function selectExportBrief(config: Config, sel: Selections): ExportBrief {
  const decisions = config.groups.map((g) => {
    const o = selectedOption(g, sel);
    const rec = g.options.find((x) => x.recommended);
    const flags = o?.specimen.kind === "decision" ? (o.specimen.flags ?? []) : [];
    return {
      group: g.id,
      title: g.title,
      optionId: o?.id ?? null,
      label: o?.label ?? null,
      locked: g.locked === true,
      flags,
      // true only when a recommendation exists and the pick differs from it
      deviation: Boolean(o && rec && o.id !== rec.id),
      // the group's "something else" free text; null when blank / not allowed
      writeIn: selectedWriteIn(g, sel) || null,
    };
  });
  const json: Record<string, unknown> = {
    version: 1,
    title: config.title ?? null,
    decisions,
    banned: config.banned ?? [],
  };
  const line = (d: (typeof decisions)[number]) => {
    const head = d.locked ? `- [LOCKED] ${d.title}` : `- ${d.title}`;
    // With no locked option, a non-empty write-in IS the group's decision.
    const label = d.label ?? (d.writeIn ? `[WRITE-IN] "${d.writeIn}"` : "(open)");
    const dev = d.deviation ? " (differs from recommendation)" : "";
    const fl = d.flags.length ? ` [${d.flags.join(", ")}]` : "";
    // Alongside a locked option, the write-in is an appended note.
    const wi = d.label && d.writeIn ? ` — write-in: "${d.writeIn}"` : "";
    return `${head}: ${label}${dev}${fl}${wi}`;
  };
  const lines: string[] = [
    `# ${config.title ?? "Loupe decision lock"}`,
    "",
    "## Decisions",
    ...decisions.map(line),
  ];
  if (config.banned?.length) {
    lines.push("", "## Banned", ...config.banned.map((b) => `- ${b}`));
  }
  if (config.workflow?.length) {
    lines.push("", "## Workflow", ...config.workflow.map((w) => `- ${w}`));
  }
  return { markdown: lines.join("\n"), json };
}

/* ------------------------------------------------------------------ *
 * Crop math — exact cover of a normalized rect into a tile (aspect AR).
 * Requires intrinsic image dims. Returns percentages relative to the tile.
 * ------------------------------------------------------------------ */

export interface CropCss {
  widthPct: number;
  leftPct: number;
  topPct: number;
}

export function cropToCss(
  rect: TRect,
  intrinsic: { width: number; height: number },
  tileAspect: number,
): CropCss {
  const IW = intrinsic.width;
  const IH = intrinsic.height;
  const TH = 1;
  const TW = tileAspect; // width in tile-height units
  // rendered full-image width (tile-height units) so the rect covers the tile
  const Wimg = Math.max(TW / rect.w, IW / (rect.h * IH));
  const Himg = (Wimg * IH) / IW;
  const OX = -(rect.x * Wimg) - (rect.w * Wimg - TW) / 2;
  const OY = -(rect.y * Himg) - (rect.h * Himg - TH) / 2;
  return {
    widthPct: round((Wimg / TW) * 100),
    leftPct: round((OX / TW) * 100),
    topPct: round((OY / TH) * 100),
  };
}

const round = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r; // normalize -0 → 0 for clean, deterministic CSS
};

/* ------------------------------------------------------------------ *
 * Theming — semantic token contract → CSS variables (`--loupe-*`)
 * ------------------------------------------------------------------ */

/**
 * Neutral "graphite" preset — unbranded, calm, deliberately NOT teal/green, so a
 * project theme reads clean on top. This was the default through v2.0; pass it as
 * `config.theme` (or `THEME_PRESETS.neutral`) when you want a blank canvas.
 */
export const NEUTRAL_TOKENS: TThemeTokens = {
  "color-bg": "oklch(98.5% 0.003 255)",
  "color-surface": "oklch(99.4% 0.002 255)",
  "color-fg": "oklch(22% 0.014 260)",
  "color-fg-muted": "oklch(52% 0.014 260)",
  "color-primary": "oklch(22% 0.014 260)",
  "color-primary-fg": "oklch(99% 0.003 255)",
  "color-border": "oklch(90% 0.006 255)",
  "color-ring": "oklch(70% 0.10 258)",
  "color-danger": "oklch(55% 0.16 25)",
  "color-signal": "oklch(80% 0.10 258)",
  "color-signal-fg": "oklch(22% 0.014 260)",
  "radius-sm": "8px",
  "radius-md": "14px",
  "radius-lg": "20px",
  "space-1": "0.25rem",
  "space-2": "0.5rem",
  "space-3": "0.75rem",
  "space-4": "1rem",
  "space-5": "1.5rem",
  "space-6": "2.5rem",
  "font-sans": "Manrope, ui-sans-serif, system-ui, sans-serif",
  "font-serif": "Georgia, 'Times New Roman', serif",
  "font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "duration-slow": "5000ms",
  "shadow-md": "0 12px 30px -18px rgba(16,24,32,0.5)",
};

/**
 * DEFAULT — the "Night Atlas" standard look every unthemed artifact wears out of
 * the box: deep teal-black ground, ivory ink, luminous turquoise accent, with a
 * distinct lighter-turquoise signal so done-state and the count badge stay legible.
 * A project's own `config.theme` still overrides this per-project.
 */
export const DEFAULT_TOKENS: TThemeTokens = {
  "color-bg": "#0c1a1c",
  "color-surface": "#11201e",
  "color-fg": "#e7ece9",
  "color-fg-muted": "#9fb2ac",
  "color-primary": "#2fd4c4",
  "color-primary-fg": "#04211d",
  "color-border": "#22403b",
  "color-ring": "#2fd4c4",
  "color-danger": "#ff7a6b",
  "color-signal": "#7ee7db",
  "color-signal-fg": "#04211d",
  "radius-sm": "8px",
  "radius-md": "14px",
  "radius-lg": "20px",
  "space-1": "0.25rem",
  "space-2": "0.5rem",
  "space-3": "0.75rem",
  "space-4": "1rem",
  "space-5": "1.5rem",
  "space-6": "2.5rem",
  "font-sans": "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  "font-serif": "Georgia, 'Times New Roman', serif",
  "font-mono": "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  "ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "duration-slow": "5000ms",
  "shadow-md": "0 18px 40px -22px rgba(0,0,0,0.7)",
};

/**
 * EDITORIAL — a light "editor's desk" preset for content-forward reading flows:
 * warm paper ground, near-black ink, a restrained bookish blue accent, and a
 * serif display voice for the step questions. Uses system font stacks only, so
 * artifacts stay self-contained (no webfont fetches). Introduces the optional
 * `font-display` token — CSS consumes it as
 * `var(--loupe-font-display, var(--loupe-font-sans))`, so themes without it
 * simply keep the sans voice.
 */
export const EDITORIAL_TOKENS: TThemeTokens = {
  "color-bg": "#faf9f7",
  "color-surface": "#ffffff",
  "color-fg": "#1c1b18",
  "color-fg-muted": "#6d6a63",
  "color-primary": "#2f55a4",
  "color-primary-fg": "#ffffff",
  "color-border": "#e3e0d8",
  "color-ring": "#2f55a4",
  "color-danger": "#a4262c",
  "color-signal": "#1c1b18",
  "color-signal-fg": "#faf9f7",
  "radius-sm": "4px",
  "radius-md": "8px",
  "radius-lg": "12px",
  "space-1": "0.25rem",
  "space-2": "0.5rem",
  "space-3": "0.75rem",
  "space-4": "1rem",
  "space-5": "1.5rem",
  "space-6": "2.5rem",
  "font-sans": "'Helvetica Neue', -apple-system, 'Segoe UI', system-ui, Arial, sans-serif",
  "font-serif": "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  "font-display": "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
  "font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
  "duration-slow": "5000ms",
  "shadow-md": "0 10px 28px -20px rgba(28,27,24,0.28)",
};

/** Named theme presets shipped for quick, on-brand theming. */
export const THEME_PRESETS = {
  nightAtlas: DEFAULT_TOKENS,
  neutral: NEUTRAL_TOKENS,
  editorial: EDITORIAL_TOKENS,
} as const;

/** A safe kebab custom-property ident (nothing that could escape the var name). */
const SAFE_TOKEN_KEY = /^[a-zA-Z0-9-]+$/;
/** Chars that could break out of a `<style>` / `:root {}` block or open a new rule. */
export const UNSAFE_TOKEN_VALUE = /[<>{}\\;@]/;
/** CSS functions that fetch or execute external resources — never valid in a token. */
export const UNSAFE_TOKEN_FUNC = /\b(url|image|image-set|-webkit-image-set|cross-fade|element|expression)\s*\(/i;

/**
 * Resolve the theme to `--loupe-*` CSS variables (overrides merged over the
 * built-in defaults). Keys that are not safe custom-property idents, and values
 * that could break out of a `<style>` block (`< > { } ; @ \`), are rejected: an
 * unsafe override on a known token falls back to the default, so a derived or
 * untrusted theme can never inject markup or extra CSS rules downstream.
 */
export function tokensToCssVars(tokens?: TThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = new Set([...Object.keys(DEFAULT_TOKENS), ...Object.keys(tokens ?? {})]);
  for (const k of [...keys].sort()) {
    if (!SAFE_TOKEN_KEY.test(k)) continue;
    const override = tokens?.[k];
    const safeOverride =
      typeof override === "string" &&
      !UNSAFE_TOKEN_VALUE.test(override) &&
      !UNSAFE_TOKEN_FUNC.test(override)
        ? override
        : undefined;
    const val = safeOverride ?? DEFAULT_TOKENS[k];
    if (typeof val === "string") out[`--loupe-${k}`] = val;
  }
  return out;
}

export function tokensToCssText(tokens?: TThemeTokens, selector = ":root"): string {
  const vars = tokensToCssVars(tokens);
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

/** The recognized semantic theme-token keys (kebab, without the `--loupe-` prefix). */
export const KNOWN_THEME_TOKENS: readonly string[] = Object.keys(DEFAULT_TOKENS);

/** Bounded edit distance, for "did you mean" suggestions on unknown tokens. */
function editDistance(a: string, b: string): number {
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n]!;
}

/**
 * Non-throwing theme lint: returns human-readable warnings for `theme` keys
 * that are not part of the known `--loupe-*` contract. Unknown keys become
 * dead CSS variables that silently do nothing, so surfacing them early avoids
 * "my theme had no effect" confusion. Empty array = all keys recognized.
 * Advisory only — this never blocks generation.
 */
export function validateThemeTokens(theme?: TThemeTokens): string[] {
  if (!theme) return [];
  const known = new Set(KNOWN_THEME_TOKENS);
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(theme)) {
    if (!known.has(key)) {
      let best: string | undefined;
      let bestD = Infinity;
      for (const k of KNOWN_THEME_TOKENS) {
        const d = editDistance(key, k);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const hint = best && bestD <= 3 ? ` (did you mean "${best}"?)` : "";
      warnings.push(`theme token "${key}" is not a recognized --loupe-* token${hint}`);
    }
    if (typeof value === "string" && UNSAFE_TOKEN_VALUE.test(value)) {
      warnings.push(
        `theme token "${key}" has an unsafe value (contains one of <>{};@\\) and will be dropped`,
      );
    }
  }
  return warnings;
}

/* ------------------------------------------------------------------ *
 * ARIA prop-getters + keyboard semantics (radiogroup, roving tabindex)
 * ------------------------------------------------------------------ */

export type Props = Record<string, string | number | boolean | undefined>;

/** The option that owns tabindex=0 in a group (checked, else first). */
export function rovingId(group: TGroup, sel: Selections): string {
  return sel[group.id] ?? group.options[0]!.id;
}

export interface Connect {
  getRootProps(): Props;
  getGroupProps(group: TGroup): Props;
  getTileProps(group: TGroup, option: TOption, sel: Selections): Props;
}

export function connect(): Connect {
  return {
    getRootProps: () => ({ "data-loupe-scope": "root" }),
    getGroupProps: (group) => ({
      role: "radiogroup",
      "aria-label": group.title,
      "data-loupe-part": "group",
      "data-group": group.id,
    }),
    getTileProps: (group, option, sel) => {
      const checked = sel[group.id] === option.id;
      return {
        role: "radio",
        "aria-checked": checked,
        "aria-disabled": group.locked === true ? true : undefined,
        disabled: group.locked === true ? true : undefined,
        "aria-label": option.label,
        tabindex: group.locked ? -1 : rovingId(group, sel) === option.id ? 0 : -1,
        "data-loupe-part": "tile",
        "data-state": checked ? "locked" : "idle",
        "data-group": group.id,
        "data-option": option.id,
      };
    },
  };
}

/**
 * Resolve a keydown on a focused tile into an action. Renderers handle focus.
 * APG radio: Arrows move + select; Space/Enter selects focused; Home/End jump.
 */
export function resolveKeydown(
  group: TGroup,
  focusedId: string,
  key: string,
): { lock: string; focus: string } | null {
  const ids = group.options.map((o) => o.id);
  const i = ids.indexOf(focusedId);
  if (i < 0) return null;
  let j = i;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      j = (i + 1) % ids.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      j = (i - 1 + ids.length) % ids.length;
      break;
    case "Home":
      j = 0;
      break;
    case "End":
      j = ids.length - 1;
      break;
    case " ":
    case "Enter":
      j = i;
      break;
    default:
      return null;
  }
  const target = ids[j]!;
  return { lock: target, focus: target };
}

/* ------------------------------------------------------------------ *
 * Security — escape author/agent text before injecting into HTML
 * ------------------------------------------------------------------ */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Allow only http(s) and relative asset URLs. */
export function safeUrl(src: string): string {
  const t = src.trim();
  if (/^(https?:)?\/\//i.test(t) || /^[./]/.test(t) || /^[\w./-]+$/.test(t)) {
    if (/^\s*javascript:/i.test(t) || /^\s*data:/i.test(t)) return "";
    return t;
  }
  return "";
}

export type { Config, TGroup, TOption, TRect, TThemeTokens };
