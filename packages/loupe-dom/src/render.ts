/**
 * Deterministic HTML rendering for Loupe. Used by both `renderToString` (SSR /
 * static) and `mount` (initial markup, then patched in place). No Date, no
 * random, no reordering of config. All author/agent text is escaped via core
 * `escapeHtml`; image URLs pass through `safeUrl`.
 */
import type {
  Config,
  TGroup,
  TOption,
  TRect,
  TSpecimen,
} from "@lucentive-labs/loupe-schema";
import {
  type Selections,
  connect,
  cropToCss,
  escapeHtml,
  groupAllowsWriteIn,
  safeUrl,
  selectComposedPreview,
  selectExportBrief,
  selectProgress,
  selectedOption,
  selectedWriteIn,
  writeInKey,
} from "@lucentive-labs/loupe-core";

/** Tile media aspect ratio (width / height). 4:3 per spec suggestion. */
export const TILE_AR = 4 / 3;

const conn = connect();

/**
 * Serialize a prop bag from core's `connect()` into HTML attributes. ARIA
 * states (`aria-*`) must carry an explicit "true"/"false" string value, not be
 * boolean HTML attributes — otherwise `aria-checked="false"` would vanish and
 * `aria-checked="true"` would render valueless. Non-ARIA booleans use HTML
 * boolean-attribute semantics (present = true, absent = false).
 */
function attrs(props: Record<string, string | number | boolean | undefined>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (typeof v === "boolean") {
      if (k.startsWith("aria-")) {
        out.push(`${escapeHtml(k)}="${v ? "true" : "false"}"`);
      } else if (v) {
        out.push(escapeHtml(k));
      }
      continue;
    }
    out.push(`${escapeHtml(k)}="${escapeHtml(String(v))}"`);
  }
  return out.join(" ");
}

interface Dims {
  width: number;
  height: number;
}

function assetDims(config: Config, asset?: string): Dims | null {
  if (!asset) return null;
  const a = config.assets[asset];
  return a ? { width: a.width, height: a.height } : null;
}

function assetSrc(config: Config, asset?: string): string {
  if (!asset) return "";
  const a = config.assets[asset];
  return a ? safeUrl(a.src) : "";
}

/**
 * Render a real <img> covering a tile, positioned by core `cropToCss`. The
 * wrapper is `overflow:hidden` + relative; the img is absolutely positioned so
 * the chosen rect always fills the tile at any aspect ratio. Falls back to an
 * object-fit cover focal crop when intrinsic dims are missing.
 */
export function cropImg(
  config: Config,
  asset: string | undefined,
  crop: TRect | undefined,
  alt: string,
  extraClass = "",
): string {
  const src = assetSrc(config, asset);
  const dims = assetDims(config, asset);
  const cls = `loupe-crop__img${extraClass ? ` ${extraClass}` : ""}`;
  if (!src) {
    return `<div class="loupe-crop__missing" role="img" aria-label="${escapeHtml(alt)}"></div>`;
  }
  if (dims && crop) {
    const css = cropToCss(crop, dims, TILE_AR);
    const style = `width:${css.widthPct}%;left:${css.leftPct}%;top:${css.topPct}%`;
    return `<img class="${cls}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" decoding="async" style="${style}" />`;
  }
  // Fallback: object-fit cover with optional focal point.
  const fx = crop ? `${round((crop.x + crop.w / 2) * 100)}% ${round((crop.y + crop.h / 2) * 100)}%` : "50% 50%";
  return `<img class="${cls} loupe-crop__img--cover" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" decoding="async" style="object-position:${fx}" />`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function paletteSwatches(colors: string[]): string {
  return colors
    .map((c) => `<i class="loupe-swatch" style="background:${escapeHtml(c)}"></i>`)
    .join("");
}

/** Render a single specimen's visual into a tile's media area. */
export function renderSpecimen(config: Config, spec: TSpecimen, alt: string): string {
  switch (spec.kind) {
    case "imageCrop":
      return `<div class="loupe-crop">${cropImg(config, spec.asset, spec.crop, spec.alt || alt)}</div>`;
    case "palette": {
      const over = spec.over ? assetSrc(config, spec.over) : "";
      const dims = spec.over ? assetDims(config, spec.over) : null;
      if (over && dims) {
        const head = `<div class="loupe-crop loupe-pal__crop">${cropImg(config, spec.over, undefined, alt)}</div>`;
        return `<div class="loupe-pal">${head}<div class="loupe-pal__row">${paletteSwatches(spec.colors)}</div></div>`;
      }
      // No backdrop asset: clean full-tile swatch grid (no collage bleed).
      return `<div class="loupe-pal loupe-pal--swatches"><div class="loupe-pal__grid">${paletteSwatches(spec.colors)}</div></div>`;
    }
    case "type": {
      const family = escapeHtml(spec.family);
      const weight = spec.weight ?? 700;
      const kicker = spec.kicker
        ? `<span class="loupe-type__kicker">${escapeHtml(spec.kicker)}</span>`
        : "";
      return `<div class="loupe-type" style="font-family:${family};font-weight:${weight}">${kicker}<span class="loupe-type__sample">${escapeHtml(spec.sample)}</span></div>`;
    }
    case "motion": {
      // Whitelist preset → class; never interpolate the raw preset into the
      // class attribute (a JS caller could pass an unparsed/hostile config).
      const motionClass =
        spec.preset === "pan"
          ? "loupe-motion--pan"
          : spec.preset === "field"
            ? "loupe-motion--field"
            : "loupe-motion--breathe";
      // Asset-free configs (token-only brand systems) have no image to crop —
      // render a themed, CSS-only motion preview, not an empty crop placeholder.
      if (!spec.asset) {
        return `<div class="loupe-crop loupe-motion ${motionClass} loupe-motion--stub" role="img" aria-label="motion preview"></div>`;
      }
      const img = cropImg(config, spec.asset, spec.crop, alt);
      if (spec.preset === "pan") {
        const img2 = cropImg(config, spec.asset2 ?? spec.asset, spec.crop2 ?? spec.crop, alt, "loupe-motion__b");
        return `<div class="loupe-crop loupe-motion loupe-motion--pan"><div class="loupe-motion__a">${img}</div><div class="loupe-motion__b-wrap">${img2}</div></div>`;
      }
      if (spec.preset === "field") {
        const dots = [
          "left:24%;top:38%",
          "left:62%;top:30%",
          "left:48%;top:64%",
          "left:78%;top:58%",
        ]
          .map((s) => `<span class="loupe-field-dot" style="${s}"></span>`)
          .join("");
        return `<div class="loupe-crop loupe-motion loupe-motion--field">${img}${dots}</div>`;
      }
      // breathe
      return `<div class="loupe-crop loupe-motion loupe-motion--breathe">${img}</div>`;
    }
    case "layoutMock":
      return renderLayoutMock(config, spec);
    case "decision": {
      const detail = spec.detail
        ? `<span class="loupe-decision__detail">${escapeHtml(spec.detail)}</span>`
        : "";
      const flags = spec.flags?.length
        ? `<span class="loupe-decision__flags">${spec.flags
            .map((f) => `<i class="loupe-decision__flag">${escapeHtml(f)}</i>`)
            .join("")}</span>`
        : "";
      return `<div class="loupe-decision"><span class="loupe-decision__summary">${escapeHtml(spec.summary)}</span>${detail}${flags}</div>`;
    }
    default:
      return "";
  }
}

/** Mini layout diagram for the layoutMock specimen kinds. */
function renderLayoutMock(
  config: Config,
  spec: Extract<TSpecimen, { kind: "layoutMock" }>,
): string {
  const img = (asset?: string, crop?: TRect) =>
    asset ? cropImg(config, asset, crop, "layout preview") : "";
  const bar = (w: string, soft = false) =>
    `<span class="loupe-mock__bar${soft ? " loupe-mock__bar--s" : ""}" style="width:${w}"></span>`;
  switch (spec.plan) {
    case "portrait":
      return `<div class="loupe-mock loupe-mock--portrait"><div class="loupe-crop loupe-mock__fill">${img(spec.asset, spec.crop)}</div><div class="loupe-mock__copy">${bar("74%")}${bar("50%", true)}</div></div>`;
    case "threshold":
      return `<div class="loupe-mock loupe-mock--threshold"><div class="loupe-crop loupe-mock__half">${img(spec.asset, spec.crop)}</div><div class="loupe-crop loupe-mock__half">${img(spec.asset2 ?? spec.asset, spec.crop2 ?? spec.crop)}</div><span class="loupe-mock__sig"></span></div>`;
    case "sparse":
      return `<div class="loupe-mock loupe-mock--sparse"><div class="loupe-mock__copy loupe-mock__copy--top">${bar("62%")}${bar("44%", true)}</div><div class="loupe-crop loupe-mock__band">${img(spec.asset, spec.crop)}</div></div>`;
    case "chapters":
      return `<div class="loupe-mock loupe-mock--chapters"><div class="loupe-mock__row"><b>01</b>${bar("100%")}</div><div class="loupe-mock__row"><b>02</b>${bar("100%", true)}</div><div class="loupe-mock__row"><b>03</b>${bar("100%", true)}</div></div>`;
    case "belowfold":
      return `<div class="loupe-mock loupe-mock--belowfold"><div class="loupe-crop loupe-mock__fill">${img(spec.asset, spec.crop)}</div><div class="loupe-mock__strip"><span class="loupe-mock__sig loupe-mock__sig--dot"></span>${bar("40%", true)}${bar("24%", true)}</div></div>`;
    case "stack":
      return `<div class="loupe-mock loupe-mock--stack"><div class="loupe-crop loupe-mock__third">${img(spec.asset, spec.crop)}</div><div class="loupe-crop loupe-mock__third">${img(spec.asset2 ?? spec.asset, spec.crop2 ?? spec.crop)}</div><div class="loupe-mock__copy">${bar("60%")}</div></div>`;
    default:
      return "";
  }
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>';

const LOCK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>';

/** A single clickable option tile. */
export function renderTile(
  config: Config,
  group: TGroup,
  option: TOption,
  sel: Selections,
): string {
  const tileProps = conn.getTileProps(group, option, sel);
  const badge = option.recommended
    ? '<span class="loupe-tile__badge">Rec</span>'
    : "";
  const cap = option.caption
    ? `<span class="loupe-tile__caption">${escapeHtml(option.caption)}</span>`
    : "";
  return `<button type="button" class="loupe-tile" ${attrs(tileProps)}>${badge}<span class="loupe-tile__media">${renderSpecimen(config, option.specimen, option.label)}</span><span class="loupe-tile__cap"><span class="loupe-tile__check">${CHECK_SVG}</span><span class="loupe-tile__label">${escapeHtml(option.label)}</span></span>${cap}</button>`;
}

/**
 * The always-on "something else" write-in under an open group's tiles. Sits
 * OUTSIDE the radiogroup (it is a text input, not a radio) and mirrors a
 * checked tile's decided styling via `data-state="filled"`.
 */
export function renderWriteIn(group: TGroup, sel: Selections): string {
  if (!groupAllowsWriteIn(group)) return "";
  const raw = sel[writeInKey(group.id)] ?? "";
  const gid = escapeHtml(group.id);
  const state = raw.trim() === "" ? "empty" : "filled";
  return `<div class="loupe-writein">
    <label class="loupe-writein__label" for="loupe-wi-${gid}">Something else — type your own</label>
    <input class="loupe-writein__input" id="loupe-wi-${gid}" type="text" value="${escapeHtml(raw)}" placeholder="Describe another direction" autocomplete="off" spellcheck="false" data-loupe-writein="${gid}" data-state="${state}" />
  </div>`;
}

/** One decision group: heading + a row of tiles (radiogroup) + write-in. */
export function renderGroup(
  config: Config,
  group: TGroup,
  sel: Selections,
  index: number,
  view: RenderView = {},
): string {
  const num = String(index + 1).padStart(2, "0");
  const groupProps = conn.getGroupProps(group);
  // The step's task question: group-level wins over the config-level default.
  // When present it becomes the visual headline and the title demotes to an eyebrow.
  const question = group.question ?? config.question;
  // getGroupProps only sees the group; when the question comes from the
  // config-level default, surface it to screen readers here.
  if (question && !group.question) {
    groupProps["aria-label"] = `${question} (${group.title})`;
  }
  const questionHtml = question
    ? `<div class="loupe-group__question">${escapeHtml(question)}</div>`
    : "";
  // Always-visible one-line lead above the prompt body.
  const lead = group.promptLead
    ? `<div class="loupe-group__lead">${escapeHtml(group.promptLead)}</div>`
    : "";
  let prompt = "";
  if (group.prompt && group.promptCollapsible) {
    // Progressive disclosure: full prompt collapses behind a summary toggle.
    // `view.openPrompts` keeps a toggled-open state across re-renders.
    prompt = `<div class="loupe-group__prompt loupe-group__prompt--collapsible">${lead}<details class="loupe-group__promptdetails" data-loupe-prompt-details="${escapeHtml(group.id)}"${view.openPrompts?.has(group.id) ? " open" : ""}><summary class="loupe-group__promptsummary">${escapeHtml(group.promptSummary ?? "Full context")}</summary><div class="loupe-group__promptfull">${escapeHtml(group.prompt)}</div></details></div>`;
  } else if (group.prompt || group.promptLead) {
    prompt = `<div class="loupe-group__prompt">${lead}${group.prompt ? `<div class="loupe-group__prompttext">${escapeHtml(group.prompt)}</div>` : ""}</div>`;
  }
  const tiles = group.options.map((o) => renderTile(config, group, o, sel)).join("");
  const cleared = sel[group.id] === undefined && selectedWriteIn(group, sel) === "";
  const lockBadge = group.locked
    ? `<span class="loupe-group__lock" title="Decision locked">${LOCK_SVG} locked</span>`
    : `<button type="button" class="loupe-group__clear" data-loupe-clear="${escapeHtml(group.id)}"${cleared ? " hidden" : ""}>Clear</button>`;
  return `<section class="loupe-group${group.locked ? " loupe-group--locked" : ""}" data-loupe-group-section="${escapeHtml(group.id)}" id="loupe-g-${escapeHtml(group.id)}">
  <div class="loupe-group__head">
    <span class="loupe-group__n">${num}</span>
    <div class="loupe-group__titles">
      <div class="loupe-group__title${question ? " loupe-group__title--eyebrow" : ""}">${escapeHtml(group.title)}</div>
      ${questionHtml}
      ${prompt}
    </div>
    ${lockBadge}
  </div>
  <div class="loupe-tiles" ${attrs(groupProps)}>${tiles}</div>
  ${renderWriteIn(group, sel)}
</section>`;
}

/** A thumbnail for the "your picks" row — derived from the locked option. */
function thumbStyle(config: Config, option: TOption | null): { style: string; glyph: string } {
  if (!option) return { style: "", glyph: "" };
  const s = option.specimen;
  if (s.kind === "imageCrop") {
    const src = assetSrc(config, s.asset);
    return { style: src ? `background-image:url(${escapeHtml(src)});background-size:cover;background-position:center` : "", glyph: "" };
  }
  if (s.kind === "motion") {
    const src = assetSrc(config, s.asset);
    return { style: src ? `background-image:url(${escapeHtml(src)});background-size:cover;background-position:center` : "", glyph: "" };
  }
  if (s.kind === "palette") {
    return { style: `background:linear-gradient(135deg, ${s.colors.map((c) => escapeHtml(c)).join(", ")})`, glyph: "" };
  }
  if (s.kind === "type") {
    return { style: "background:var(--loupe-color-surface)", glyph: "Aa" };
  }
  if (s.kind === "layoutMock") {
    const src = s.asset ? assetSrc(config, s.asset) : "";
    return { style: src ? `background-image:url(${escapeHtml(src)});background-size:cover;background-position:center` : "background:var(--loupe-color-surface)", glyph: src ? "" : "▦" };
  }
  if (s.kind === "decision") {
    return { style: "background:var(--loupe-color-surface)", glyph: "✓" };
  }
  return { style: "", glyph: "" };
}

export function renderThumbs(config: Config, sel: Selections): string {
  const cells = config.groups
    .map((g) => {
      const o = selectedOption(g, sel);
      const wi = selectedWriteIn(g, sel);
      // A write-in-only group is decided: pencil glyph instead of the empty hatch.
      const { style, glyph } =
        !o && wi
          ? { style: "background:var(--loupe-color-surface)", glyph: "✎" }
          : thumbStyle(config, o);
      const cls = o || wi ? "loupe-thumb" : "loupe-thumb loupe-thumb--empty";
      const title = `${g.title}: ${o ? o.label : wi ? `"${wi}"` : "—"}`;
      const inner = glyph ? `<span class="loupe-thumb__g">${escapeHtml(glyph)}</span>` : "";
      return `<button type="button" class="${cls}" data-loupe-thumb="${escapeHtml(g.id)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" style="${style}">${inner}</button>`;
    })
    .join("");
  return `<div class="loupe-thumbs" data-loupe-thumbs>${cells}</div>`;
}

/** Render one band of the composed preview from a band model. */
function renderPreviewBand(
  config: Config,
  band: ReturnType<typeof selectComposedPreview>["bands"][number],
): string {
  const o = band.option;
  const labelText = o ? o.label : `${band.group.title} — open`;
  if (!o) {
    // A write-in with no locked option IS the decision: show the text itself.
    if (band.writeIn) {
      return `<div class="loupe-pv__band loupe-pv__band--decision" data-loupe-pv-slot="${escapeHtml(band.slot)}"><span class="loupe-pv__decision">&ldquo;${escapeHtml(band.writeIn)}&rdquo;</span><span class="loupe-pv__tag">${escapeHtml(band.group.title)} — write-in</span></div>`;
    }
    return `<div class="loupe-pv__band loupe-pv__band--empty" data-loupe-pv-slot="${escapeHtml(band.slot)}"><span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  const s = o.specimen;
  const as = band.as;
  // Image-bearing specimens render as a media band.
  if (s.kind === "imageCrop") {
    const media = `<div class="loupe-crop loupe-pv__media">${cropImg(config, s.asset, s.crop, o.label)}</div>`;
    return `<div class="loupe-pv__band loupe-pv__band--${escapeHtml(as)}" data-loupe-pv-slot="${escapeHtml(band.slot)}">${media}<span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  if (s.kind === "motion") {
    const media = renderSpecimen(config, s, o.label);
    return `<div class="loupe-pv__band loupe-pv__band--${escapeHtml(as)}" data-loupe-pv-slot="${escapeHtml(band.slot)}">${media}<span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  if (s.kind === "layoutMock") {
    const media = renderSpecimen(config, s, o.label);
    return `<div class="loupe-pv__band loupe-pv__band--${escapeHtml(as)}" data-loupe-pv-slot="${escapeHtml(band.slot)}"><div class="loupe-pv__mock">${media}</div><span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  if (s.kind === "palette") {
    const swatches = paletteSwatches(s.colors);
    return `<div class="loupe-pv__band loupe-pv__band--swatch" data-loupe-pv-slot="${escapeHtml(band.slot)}"><div class="loupe-pv__swatches">${swatches}</div><span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  if (s.kind === "decision") {
    return `<div class="loupe-pv__band loupe-pv__band--decision" data-loupe-pv-slot="${escapeHtml(band.slot)}"><span class="loupe-pv__decision">${escapeHtml(s.summary)}</span><span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
  }
  // type
  return `<div class="loupe-pv__band loupe-pv__band--headline" data-loupe-pv-slot="${escapeHtml(band.slot)}"><span class="loupe-pv__headline" style="font-family:${escapeHtml(s.family)};font-weight:${s.weight ?? 700}">${escapeHtml(s.sample)}</span><span class="loupe-pv__tag">${escapeHtml(labelText)}</span></div>`;
}

/** The composed preview panel built from `selectComposedPreview`. */
export function renderComposedPreview(config: Config, sel: Selections): string {
  const model = selectComposedPreview(config, sel);
  const anyLocked = model.bands.some((b) => b.option || b.writeIn);
  if (!anyLocked) {
    return `<div class="loupe-pv" data-loupe-preview><div class="loupe-pv__empty">Lock a few tiles —<br />the live preview composes here.</div></div>`;
  }
  const headline = model.headline
    ? `<div class="loupe-pv__heading"><span class="loupe-pv__heading-k">${escapeHtml(config.title ?? "Preview")}</span><span class="loupe-pv__heading-h">${escapeHtml(model.headline)}</span></div>`
    : "";
  // Drop only the headline SOURCE band (its group feeds the hero heading above),
  // not any band whose text merely coincides with the headline string.
  const headlineFrom = config.preview?.headlineFrom;
  const bands = model.bands
    .filter((b) => !(model.headline && headlineFrom && b.group.id === headlineFrom))
    .map((b) => renderPreviewBand(config, b))
    .join("");
  return `<div class="loupe-pv" data-loupe-preview><div class="loupe-pv__frame">${headline}${bands}</div></div>`;
}

/** Progress pill content. */
export function renderProgressPill(config: Config, sel: Selections): string {
  const { locked, total } = selectProgress(config, sel);
  return `<span class="loupe-pill" aria-live="polite"><b data-loupe-progress>${locked}</b> of ${total} locked</span>`;
}

/** Sticky stack: composed preview + thumbnails + controls. */
export function renderStack(config: Config, sel: Selections): string {
  const { locked, total } = selectProgress(config, sel);
  return `<aside class="loupe-stack" data-loupe-stack aria-label="Composed preview">
  <button type="button" class="loupe-stack__handle" data-loupe-sheet-toggle aria-expanded="false">
    <span class="loupe-stack__grip" aria-hidden="true"></span>
    <span class="loupe-stack__handle-label">Live preview</span>
    <span class="loupe-stack__handle-count"><b data-loupe-progress>${locked}</b>/${total} ›</span>
  </button>
  <div class="loupe-stack__head">
    <div>
      <h3 class="loupe-stack__title">Composed preview</h3>
      <div class="loupe-stack__sub">Live from your picks</div>
    </div>
    <span class="loupe-stack__sub"><b data-loupe-progress>${locked}</b> / ${total}</span>
  </div>
  <div class="loupe-stack__scroll">
    <div class="loupe-stack__preview-wrap" data-loupe-preview-wrap>${renderComposedPreview(config, sel)}</div>
    <div class="loupe-stack__thumbs">
      <h4 class="loupe-stack__thumbs-title">Your picks</h4>
      <div data-loupe-thumbs-wrap>${renderThumbs(config, sel)}</div>
    </div>
    <div class="loupe-stack__foot">
      <button type="button" class="loupe-btn loupe-btn--signal" data-loupe-recommend>Recommended</button>
      <button type="button" class="loupe-btn loupe-btn--ghost" data-loupe-reset>Reset</button>
      <button type="button" class="loupe-btn loupe-btn--primary" data-loupe-scroll-brief>Brief</button>
    </div>
  </div>
</aside>`;
}

/**
 * The structured decision rows for the review summary. Exported so the mount can
 * patch them live during write-in typing without a full re-render.
 */
export function renderBriefRows(config: Config, sel: Selections): string {
  const decisions = (selectExportBrief(config, sel).json.decisions ?? []) as Array<{
    title: string;
    label: string | null;
    locked: boolean;
    flags: string[];
    deviation: boolean;
    writeIn: string | null;
  }>;
  return decisions
    .map((d) => {
      const open = !d.label && !d.writeIn;
      const answer = d.label
        ? escapeHtml(d.label)
        : d.writeIn
          ? `&ldquo;${escapeHtml(d.writeIn)}&rdquo;`
          : "(open)";
      const acls = d.label ? "" : d.writeIn ? " loupe-brief__a--writein" : " loupe-brief__a--open";
      const dev = d.deviation ? `<span class="loupe-brief__dev">changed</span>` : "";
      const flags = d.flags.length
        ? `<span class="loupe-brief__flags">${d.flags.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</span>`
        : "";
      const note = d.label && d.writeIn ? `<span class="loupe-brief__note">note: &ldquo;${escapeHtml(d.writeIn)}&rdquo;</span>` : "";
      const lock = d.locked ? `<span class="loupe-brief__lock" title="Locked">${LOCK_SVG}</span>` : "";
      return `<li class="loupe-brief__row"${open ? ' data-open="true"' : ""}><span class="loupe-brief__q">${escapeHtml(d.title)}${lock}</span><span class="loupe-brief__a${acls}">${answer}${dev}${flags}</span>${note}</li>`;
    })
    .join("");
}

/** The secondary export-brief section from `selectExportBrief`. */
export function renderExportBrief(config: Config, sel: Selections): string {
  const brief = selectExportBrief(config, sel);
  const rows = renderBriefRows(config, sel);
  const banned = config.banned?.length
    ? `<section class="loupe-banned" id="loupe-banned">
      <h3 class="loupe-banned__title">Banned</h3>
      <ul class="loupe-banned__list">${config.banned.map((b) => `<li class="loupe-banned__item"><span aria-hidden="true">✕</span><span>${escapeHtml(b)}</span></li>`).join("")}</ul>
    </section>`
    : "";
  const workflow = config.workflow?.length
    ? `<section class="loupe-workflow" id="loupe-workflow">
      <h3 class="loupe-workflow__title">Workflow</h3>
      <ul class="loupe-workflow__list">${config.workflow.map((w) => `<li class="loupe-workflow__item">${escapeHtml(w)}</li>`).join("")}</ul>
    </section>`
    : "";
  return `<section class="loupe-export" id="loupe-brief">
  <div class="loupe-export__head">
    <h2 class="loupe-export__title">Review &amp; hand off</h2>
    <p class="loupe-export__lead">Confirm your decisions, then hand them to the build pass.</p>
    <div class="loupe-export__actions">
      <button type="button" class="loupe-btn loupe-btn--signal loupe-handoff" data-loupe-handoff>Hand off &amp; continue →</button>
      <button type="button" class="loupe-btn loupe-btn--primary" data-loupe-copy>Copy brief</button>
      <button type="button" class="loupe-btn loupe-btn--ghost" data-loupe-reset>Reset</button>
    </div>
    <p class="loupe-export__status" data-loupe-status aria-live="polite"></p>
  </div>
  <ol class="loupe-brief" data-loupe-brief-summary>${rows}</ol>
  ${workflow}
  ${banned}
  <details class="loupe-export__raw">
    <summary class="loupe-export__raw-toggle">Raw brief · markdown for the build pass</summary>
    <textarea class="loupe-export__brief" data-loupe-brief spellcheck="false" aria-label="Generated build brief">${escapeHtml(brief.markdown)}</textarea>
  </details>
</section>`;
}

/** View state the flow (stepper) layout needs beyond config + selections. */
export interface RenderView {
  /** Active step index in flow mode (0..groups.length; the last is Review). */
  step?: number;
  /**
   * Ids of groups whose collapsible prompt is currently expanded — the mount
   * tracks `<details>` toggles here so an opened prompt survives re-renders.
   */
  openPrompts?: ReadonlySet<string>;
}

/**
 * The full interactive UI markup. Deterministic for a given (config, sel, view)
 * — identical for SSR and initial mount. Branches on `config.layout`: "flow"
 * (default) is the guided one-question-at-a-time stepper; "page" is the dense
 * single-scroll lab.
 */
export function renderApp(config: Config, sel: Selections, view: RenderView = {}): string {
  const layout = config.layout ?? "flow";
  return layout === "page"
    ? renderPageApp(config, sel, view)
    : renderFlowApp(config, sel, view.step ?? 0, view);
}

/** Dense single-scroll layout: all groups + sticky preview + export brief. */
function renderPageApp(config: Config, sel: Selections, view: RenderView = {}): string {
  const title = escapeHtml(config.title ?? "Loupe decision lock");
  const groups = config.groups
    .map((g, i) => renderGroup(config, g, sel, i, view))
    .join("\n");
  return `<div class="loupe" data-loupe-root>
  <header class="loupe-header">
    <div class="loupe-header__inner">
      <div class="loupe-header__title">${title}</div>
      ${renderProgressPill(config, sel)}
    </div>
  </header>
  <main class="loupe-main">
    <section class="loupe-lab">
      <div class="loupe-lab__grid">
        <div class="loupe-groups" data-loupe-groups>
${groups}
        </div>
        ${renderStack(config, sel)}
      </div>
    </section>
    ${renderExportBrief(config, sel)}
  </main>
</div>`;
}

/** Guided stepper: one decision per screen + a final review / hand-off step. */
function renderFlowApp(
  config: Config,
  sel: Selections,
  rawStep: number,
  view: RenderView = {},
): string {
  const title = escapeHtml(config.title ?? "Loupe decision lock");
  const groups = config.groups;
  const groupCount = groups.length;
  const stepCount = groupCount + 1; // groups + review
  const step = Math.max(0, Math.min(Math.trunc(rawStep) || 0, stepCount - 1));
  const { locked, total } = selectProgress(config, sel);
  const onReview = step === groupCount;

  const rail = groups
    .map((g, i) => {
      const done = sel[g.id] !== undefined || selectedWriteIn(g, sel) !== "";
      const active = i === step;
      const cls = `loupe-railstep${active ? " is-active" : ""}${done ? " is-done" : ""}`;
      return `<button type="button" class="${cls}" data-loupe-rail-step="${i}" aria-current="${active ? "step" : "false"}" aria-label="${escapeHtml(g.title)}"><span class="loupe-railstep__dot" aria-hidden="true"></span></button>`;
    })
    .join("");
  const reviewRail = `<button type="button" class="loupe-railstep loupe-railstep--review${onReview ? " is-active" : ""}" data-loupe-rail-step="${groupCount}" aria-current="${onReview ? "step" : "false"}" aria-label="Review and hand off"><span class="loupe-railstep__dot" aria-hidden="true"></span></button>`;

  const renderStep = (inner: string, idx: number, active: boolean, extraClass = ""): string =>
    `<section class="loupe-step${extraClass}${active ? " is-active" : ""}" data-loupe-step="${idx}" aria-hidden="${active ? "false" : "true"}"${active ? "" : " inert"}>${inner}</section>`;
  const groupSteps = groups
    .map((g, i) => renderStep(renderGroup(config, g, sel, i, view), i, i === step))
    .join("\n");
  const reviewStep = renderStep(renderReview(config, sel), groupCount, onReview, " loupe-step--review");

  const backDisabled = step === 0 ? " disabled" : "";
  const nextLabel = step === groupCount - 1 ? "Review" : "Next";
  const nextBtn = onReview
    ? ""
    : `<button type="button" class="loupe-btn loupe-btn--primary" data-loupe-nav="next">${nextLabel}</button>`;
  const counter = onReview ? "Review &amp; hand off" : `Question ${step + 1} of ${groupCount}`;

  return `<div class="loupe loupe--flow" data-loupe-root data-loupe-flow data-step="${step}">
  <header class="loupe-flow__top">
    <div class="loupe-flow__brand">${title}</div>
    <nav class="loupe-rail" data-loupe-rail aria-label="Decision steps">${rail}${reviewRail}</nav>
    <span class="loupe-pill" aria-live="polite"><b data-loupe-progress>${locked}</b> of ${total} locked</span>
  </header>
  <main class="loupe-flow__stage">
${groupSteps}
    ${reviewStep}
  </main>
  <footer class="loupe-flow__nav">
    <button type="button" class="loupe-btn loupe-btn--ghost" data-loupe-nav="back"${backDisabled}>Back</button>
    <span class="loupe-flow__counter" aria-live="polite">${counter}</span>
    ${nextBtn}
  </footer>
</div>`;
}

/** The final flow step: composed preview + export brief + hand-off. */
function renderReview(config: Config, sel: Selections): string {
  return `<div class="loupe-review">
  <div class="loupe-review__head">
    <h2 class="loupe-review__title">Review &amp; hand off</h2>
    <p class="loupe-review__lead">Everything you locked, composed. Hand the brief to the build pass.</p>
  </div>
  <div class="loupe-review__grid">
    <div class="loupe-review__preview">${renderComposedPreview(config, sel)}</div>
    <div class="loupe-review__brief">${renderExportBrief(config, sel)}</div>
  </div>
</div>`;
}
