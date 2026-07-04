"use client";

/**
 * @lucentive-labs/loupe-react — React 19 adapter for Loupe.
 *
 * A THIN view over `@lucentive-labs/loupe-core`. All selection state, a11y
 * semantics, keyboard handling, crop math, and the preview/brief derivations
 * live in core — this package only maps core's `connect()` descriptors to React
 * props and renders the same structure as the canonical `loupe-dom` renderer
 * (identical class names + `data-loupe-part` / `data-group` / `data-option` /
 * ARIA), so consumers can style it with `@lucentive-labs/loupe-dom/styles.css`.
 *
 * State flows through React 19 `useSyncExternalStore` against the core store's
 * stable cached snapshot + deterministic server snapshot, so SSR and hydration
 * agree without a client-only flash.
 */
import {
  type ReactNode,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  Config,
  TGroup,
  TOption,
  TRect,
  TSpecimen,
  TThemeTokens,
} from "@lucentive-labs/loupe-schema";
import {
  type LoupeStore,
  type Props,
  type Selections,
  type StoragePort,
  connect,
  cropToCss,
  createLoupeStore,
  groupAllowsWriteIn,
  localStorageAdapter,
  resolveKeydown,
  safeUrl,
  selectComposedPreview,
  selectExportBrief,
  selectProgress,
  selectedOption,
  selectedWriteIn,
  tokensToCssVars,
  writeInKey,
} from "@lucentive-labs/loupe-core";

/** Tile media aspect ratio (width / height). Matches loupe-dom `TILE_AR`. */
export const TILE_AR = 4 / 3;

const conn = connect();

/* ------------------------------------------------------------------ *
 * React normalizeProps — core descriptor bag → React DOM props.
 * ------------------------------------------------------------------ */

type ReactDomProps = Record<string, string | number | boolean | undefined>;

/**
 * Map a core `connect()` prop bag onto React DOM props. Core emits HTML-shaped
 * keys (`tabindex`, `aria-checked` as a real boolean, `data-*`); React wants
 * `tabIndex` and is happy with boolean `aria-*` (it serializes them to
 * "true"/"false"). Everything else (`role`, `aria-label`, `data-*`) passes
 * through unchanged. Undefined values are dropped so React omits the attribute.
 */
export function normalizeProps(props: Props): ReactDomProps {
  const out: ReactDomProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === "tabindex") {
      out.tabIndex = typeof v === "number" ? v : Number(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Crop / specimen rendering — mirrors loupe-dom render.ts structure.
 * Pure presentation; no logic re-implemented beyond calling core helpers.
 * ------------------------------------------------------------------ */

const round = (n: number) => Math.round(n * 1000) / 1000;

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
 * A real <img> covering a tile, positioned by core `cropToCss`. Falls back to
 * object-fit cover (focal crop) when intrinsic dims are missing. Structurally
 * equivalent to loupe-dom `cropImg`.
 */
function CropImg(props: {
  config: Config;
  asset: string | undefined;
  crop: TRect | undefined;
  alt: string;
  extraClass?: string;
}): ReactNode {
  const { config, asset, crop, alt, extraClass = "" } = props;
  const src = assetSrc(config, asset);
  const dims = assetDims(config, asset);
  const cls = `loupe-crop__img${extraClass ? ` ${extraClass}` : ""}`;
  if (!src) {
    return <div className="loupe-crop__missing" role="img" aria-label={alt} />;
  }
  if (dims && crop) {
    const css = cropToCss(crop, dims, TILE_AR);
    const style: CSSProperties = {
      width: `${css.widthPct}%`,
      left: `${css.leftPct}%`,
      top: `${css.topPct}%`,
    };
    return (
      <img className={cls} src={src} alt={alt} decoding="async" style={style} />
    );
  }
  const fx = crop
    ? `${round((crop.x + crop.w / 2) * 100)}% ${round((crop.y + crop.h / 2) * 100)}%`
    : "50% 50%";
  return (
    <img
      className={`${cls} loupe-crop__img--cover`}
      src={src}
      alt={alt}
      decoding="async"
      style={{ objectPosition: fx }}
    />
  );
}

function PaletteSwatches({ colors }: { colors: string[] }): ReactNode {
  return (
    <>
      {colors.map((c, i) => (
        <i key={i} className="loupe-swatch" style={{ background: c }} />
      ))}
    </>
  );
}

const reduceMotion = "(prefers-reduced-motion: reduce)";

/** Render a single specimen's visual into a tile's media area. */
function Specimen({
  config,
  spec,
  alt,
}: {
  config: Config;
  spec: TSpecimen;
  alt: string;
}): ReactNode {
  switch (spec.kind) {
    case "imageCrop":
      return (
        <div className="loupe-crop">
          <CropImg config={config} asset={spec.asset} crop={spec.crop} alt={spec.alt || alt} />
        </div>
      );
    case "palette": {
      const over = spec.over ? assetSrc(config, spec.over) : "";
      const dims = spec.over ? assetDims(config, spec.over) : null;
      if (over && dims) {
        return (
          <div className="loupe-pal">
            <div className="loupe-crop loupe-pal__crop">
              <CropImg config={config} asset={spec.over} crop={undefined} alt={alt} />
            </div>
            <div className="loupe-pal__row">
              <PaletteSwatches colors={spec.colors} />
            </div>
          </div>
        );
      }
      return (
        <div className="loupe-pal loupe-pal--swatches">
          <div className="loupe-pal__grid">
            <PaletteSwatches colors={spec.colors} />
          </div>
        </div>
      );
    }
    case "type": {
      const weight = spec.weight ?? 700;
      return (
        <div
          className="loupe-type"
          style={{ fontFamily: spec.family, fontWeight: weight }}
        >
          {spec.kicker ? (
            <span className="loupe-type__kicker">{spec.kicker}</span>
          ) : null}
          <span className="loupe-type__sample">{spec.sample}</span>
        </div>
      );
    }
    case "motion": {
      // Motion presets are gated by prefers-reduced-motion in styles.css; the
      // structure is identical to loupe-dom so the same rules apply. We render
      // the same DOM regardless of the media query (CSS does the gating), and
      // additionally annotate the reduced state for any JS-driven consumers.
      const img = (
        <CropImg config={config} asset={spec.asset} crop={spec.crop} alt={alt} />
      );
      if (spec.preset === "pan") {
        return (
          <div className="loupe-crop loupe-motion loupe-motion--pan" data-loupe-reduced={prefersReducedMotion() || undefined}>
            <div className="loupe-motion__a">{img}</div>
            <div className="loupe-motion__b-wrap">
              <CropImg
                config={config}
                asset={spec.asset2 ?? spec.asset}
                crop={spec.crop2 ?? spec.crop}
                alt={alt}
                extraClass="loupe-motion__b"
              />
            </div>
          </div>
        );
      }
      if (spec.preset === "field") {
        const dots = ["left:24%;top:38%", "left:62%;top:30%", "left:48%;top:64%", "left:78%;top:58%"];
        return (
          <div className="loupe-crop loupe-motion loupe-motion--field" data-loupe-reduced={prefersReducedMotion() || undefined}>
            {img}
            {dots.map((s, i) => (
              <span key={i} className="loupe-field-dot" style={styleFromText(s)} />
            ))}
          </div>
        );
      }
      return (
        <div className="loupe-crop loupe-motion loupe-motion--breathe" data-loupe-reduced={prefersReducedMotion() || undefined}>
          {img}
        </div>
      );
    }
    case "layoutMock":
      return <LayoutMock config={config} spec={spec} />;
    case "decision":
      return (
        <div className="loupe-decision">
          <span className="loupe-decision__summary">{spec.summary}</span>
          {spec.detail ? (
            <span className="loupe-decision__detail">{spec.detail}</span>
          ) : null}
          {spec.flags?.length ? (
            <span className="loupe-decision__flags">
              {spec.flags.map((f) => (
                <i key={f} className="loupe-decision__flag">
                  {f}
                </i>
              ))}
            </span>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}

/** True when the environment requests reduced motion (SSR-safe: false). */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(reduceMotion).matches
    );
  } catch {
    return false;
  }
}

/** Parse a `"prop:val;prop:val"` inline string into a React style object. */
function styleFromText(text: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of text.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const key = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (key) out[key] = val;
  }
  return out as CSSProperties;
}

function MockBar({ w, soft = false }: { w: string; soft?: boolean }): ReactNode {
  return (
    <span
      className={`loupe-mock__bar${soft ? " loupe-mock__bar--s" : ""}`}
      style={{ width: w }}
    />
  );
}

/** Mini layout diagram for the layoutMock specimen kinds. */
function LayoutMock({
  config,
  spec,
}: {
  config: Config;
  spec: Extract<TSpecimen, { kind: "layoutMock" }>;
}): ReactNode {
  const Img = ({ asset, crop }: { asset?: string; crop?: TRect }): ReactNode =>
    asset ? <CropImg config={config} asset={asset} crop={crop} alt="layout preview" /> : null;
  switch (spec.plan) {
    case "portrait":
      return (
        <div className="loupe-mock loupe-mock--portrait">
          <div className="loupe-crop loupe-mock__fill">
            <Img asset={spec.asset} crop={spec.crop} />
          </div>
          <div className="loupe-mock__copy">
            <MockBar w="74%" />
            <MockBar w="50%" soft />
          </div>
        </div>
      );
    case "threshold":
      return (
        <div className="loupe-mock loupe-mock--threshold">
          <div className="loupe-crop loupe-mock__half">
            <Img asset={spec.asset} crop={spec.crop} />
          </div>
          <div className="loupe-crop loupe-mock__half">
            <Img asset={spec.asset2 ?? spec.asset} crop={spec.crop2 ?? spec.crop} />
          </div>
          <span className="loupe-mock__sig" />
        </div>
      );
    case "sparse":
      return (
        <div className="loupe-mock loupe-mock--sparse">
          <div className="loupe-mock__copy loupe-mock__copy--top">
            <MockBar w="62%" />
            <MockBar w="44%" soft />
          </div>
          <div className="loupe-crop loupe-mock__band">
            <Img asset={spec.asset} crop={spec.crop} />
          </div>
        </div>
      );
    case "chapters":
      return (
        <div className="loupe-mock loupe-mock--chapters">
          <div className="loupe-mock__row">
            <b>01</b>
            <MockBar w="100%" />
          </div>
          <div className="loupe-mock__row">
            <b>02</b>
            <MockBar w="100%" soft />
          </div>
          <div className="loupe-mock__row">
            <b>03</b>
            <MockBar w="100%" soft />
          </div>
        </div>
      );
    case "belowfold":
      return (
        <div className="loupe-mock loupe-mock--belowfold">
          <div className="loupe-crop loupe-mock__fill">
            <Img asset={spec.asset} crop={spec.crop} />
          </div>
          <div className="loupe-mock__strip">
            <span className="loupe-mock__sig loupe-mock__sig--dot" />
            <MockBar w="40%" soft />
            <MockBar w="24%" soft />
          </div>
        </div>
      );
    case "stack":
      return (
        <div className="loupe-mock loupe-mock--stack">
          <div className="loupe-crop loupe-mock__third">
            <Img asset={spec.asset} crop={spec.crop} />
          </div>
          <div className="loupe-crop loupe-mock__third">
            <Img asset={spec.asset2 ?? spec.asset} crop={spec.crop2 ?? spec.crop} />
          </div>
          <div className="loupe-mock__copy">
            <MockBar w="60%" />
          </div>
        </div>
      );
    default:
      return null;
  }
}

const CheckSvg = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={3.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
);

/* ------------------------------------------------------------------ *
 * Tiles + groups — a11y/keyboard wired straight to core.
 * ------------------------------------------------------------------ */

function Tile({
  config,
  group,
  option,
  sel,
  store,
}: {
  config: Config;
  group: TGroup;
  option: TOption;
  sel: Selections;
  store: LoupeStore;
}): ReactNode {
  const tileProps = normalizeProps(conn.getTileProps(group, option, sel));

  const onClick = useCallback(() => {
    store.lock(group.id, option.id);
  }, [store, group.id, option.id]);

  const onKeyDown = useCallback(
    (ev: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (group.locked) return;
      const res = resolveKeydown(group, option.id, ev.key);
      if (!res) return;
      ev.preventDefault();
      store.lock(group.id, res.lock);
      // Roving focus: after the store re-renders, the target tile owns
      // tabindex=0. Move focus onto it by data address (matches loupe-dom).
      const root = ev.currentTarget.closest<HTMLElement>("[data-loupe-root]");
      const next = root?.querySelector<HTMLElement>(
        `[data-loupe-part="tile"][data-group="${cssEscape(group.id)}"][data-option="${cssEscape(res.focus)}"]`,
      );
      next?.focus();
    },
    [store, group, option.id],
  );

  return (
    <button type="button" className="loupe-tile" {...tileProps} onClick={onClick} onKeyDown={onKeyDown}>
      {option.recommended ? <span className="loupe-tile__badge">Rec</span> : null}
      <span className="loupe-tile__media">
        <Specimen config={config} spec={option.specimen} alt={option.label} />
      </span>
      <span className="loupe-tile__cap">
        <span className="loupe-tile__check">
          <CheckSvg />
        </span>
        <span className="loupe-tile__label">{option.label}</span>
      </span>
      {option.caption ? (
        <span className="loupe-tile__caption">{option.caption}</span>
      ) : null}
    </button>
  );
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(s)
    : s.replace(/["\\]/g, "\\$&");
}

/**
 * The always-on "something else" write-in under an open group's tiles —
 * structurally equivalent to loupe-dom `renderWriteIn` (same classes /
 * `data-loupe-writein` / `data-state`). Controlled by the core store, so
 * typing flows into the brief, preview, and progress like a tile lock.
 */
function WriteIn({
  group,
  sel,
  store,
}: {
  group: TGroup;
  sel: Selections;
  store: LoupeStore;
}): ReactNode {
  if (!groupAllowsWriteIn(group)) return null;
  const raw = sel[writeInKey(group.id)] ?? "";
  return (
    <div className="loupe-writein">
      <label className="loupe-writein__label" htmlFor={`loupe-wi-${group.id}`}>
        Something else — type your own
      </label>
      <input
        className="loupe-writein__input"
        id={`loupe-wi-${group.id}`}
        type="text"
        value={raw}
        placeholder="Describe another direction"
        autoComplete="off"
        spellCheck={false}
        data-loupe-writein={group.id}
        data-state={raw.trim() === "" ? "empty" : "filled"}
        onChange={(ev) => store.writeIn(group.id, ev.currentTarget.value)}
      />
    </div>
  );
}

function Group({
  config,
  group,
  sel,
  index,
  store,
}: {
  config: Config;
  group: TGroup;
  sel: Selections;
  index: number;
  store: LoupeStore;
}): ReactNode {
  const num = String(index + 1).padStart(2, "0");
  const groupProps = normalizeProps(conn.getGroupProps(group));
  const cleared = sel[group.id] === undefined && selectedWriteIn(group, sel) === "";
  return (
    <section
      className={group.locked ? "loupe-group loupe-group--locked" : "loupe-group"}
      data-loupe-group-section={group.id}
      id={`loupe-g-${group.id}`}
    >
      <div className="loupe-group__head">
        <span className="loupe-group__n">{num}</span>
        <div className="loupe-group__titles">
          <div className="loupe-group__title">{group.title}</div>
          {group.prompt ? (
            <div className="loupe-group__prompt">{group.prompt}</div>
          ) : null}
        </div>
        {group.locked ? (
          <span className="loupe-group__lock" title="Decision locked">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="14" height="14"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></svg>
            {" locked"}
          </span>
        ) : (
          <button
            type="button"
            className="loupe-group__clear"
            data-loupe-clear={group.id}
            hidden={cleared}
            onClick={() => store.clear(group.id)}
          >
            Clear
          </button>
        )}
      </div>
      <div className="loupe-tiles" {...groupProps}>
        {group.options.map((o) => (
          <Tile key={o.id} config={config} group={group} option={o} sel={sel} store={store} />
        ))}
      </div>
      <WriteIn group={group} sel={sel} store={store} />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Thumbnails ("your picks") — derived via core selectedOption.
 * ------------------------------------------------------------------ */

function thumbStyle(
  config: Config,
  option: TOption | null,
): { style: CSSProperties; glyph: string } {
  if (!option) return { style: {}, glyph: "" };
  const s = option.specimen;
  if (s.kind === "imageCrop" || s.kind === "motion") {
    const src = assetSrc(config, s.asset);
    return {
      style: src
        ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
        : {},
      glyph: "",
    };
  }
  if (s.kind === "palette") {
    return {
      style: { background: `linear-gradient(135deg, ${s.colors.join(", ")})` },
      glyph: "",
    };
  }
  if (s.kind === "type") {
    return { style: { background: "var(--loupe-color-surface)" }, glyph: "Aa" };
  }
  if (s.kind === "layoutMock") {
    const src = s.asset ? assetSrc(config, s.asset) : "";
    return {
      style: src
        ? { backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: "var(--loupe-color-surface)" },
      glyph: src ? "" : "▦",
    };
  }
  if (s.kind === "decision") {
    return { style: { background: "var(--loupe-color-surface)" }, glyph: "✓" };
  }
  return { style: {}, glyph: "" };
}

function Thumbs({
  config,
  sel,
  store,
}: {
  config: Config;
  sel: Selections;
  store: LoupeStore;
}): ReactNode {
  return (
    <div className="loupe-thumbs" data-loupe-thumbs>
      {config.groups.map((g) => {
        const o = selectedOption(g, sel);
        const wi = selectedWriteIn(g, sel);
        // A write-in-only group is decided: pencil glyph instead of the empty hatch.
        const { style, glyph } =
          !o && wi
            ? { style: { background: "var(--loupe-color-surface)" } as CSSProperties, glyph: "✎" }
            : thumbStyle(config, o);
        const cls = o || wi ? "loupe-thumb" : "loupe-thumb loupe-thumb--empty";
        const title = `${g.title}: ${o ? o.label : wi ? `"${wi}"` : "—"}`;
        return (
          <button
            key={g.id}
            type="button"
            className={cls}
            data-loupe-thumb={g.id}
            title={title}
            aria-label={title}
            style={style}
            onClick={() => scrollToGroup(g.id)}
          >
            {glyph ? <span className="loupe-thumb__g">{glyph}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function scrollToGroup(id: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(`loupe-g-${id}`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ------------------------------------------------------------------ *
 * Composed preview — built from core selectComposedPreview.
 * ------------------------------------------------------------------ */

type PreviewBand = ReturnType<typeof selectComposedPreview>["bands"][number];

function PreviewBandView({
  config,
  band,
}: {
  config: Config;
  band: PreviewBand;
}): ReactNode {
  const o = band.option;
  const labelText = o ? o.label : `${band.group.title} — open`;
  if (!o) {
    // A write-in with no locked option IS the decision: show the text itself.
    if (band.writeIn) {
      return (
        <div className="loupe-pv__band loupe-pv__band--decision" data-loupe-pv-slot={band.slot}>
          <span className="loupe-pv__decision">{`“${band.writeIn}”`}</span>
          <span className="loupe-pv__tag">{`${band.group.title} — write-in`}</span>
        </div>
      );
    }
    return (
      <div
        className="loupe-pv__band loupe-pv__band--empty"
        data-loupe-pv-slot={band.slot}
      >
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  const s = o.specimen;
  const as = band.as;
  if (s.kind === "imageCrop") {
    return (
      <div className={`loupe-pv__band loupe-pv__band--${as}`} data-loupe-pv-slot={band.slot}>
        <div className="loupe-crop loupe-pv__media">
          <CropImg config={config} asset={s.asset} crop={s.crop} alt={o.label} />
        </div>
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  if (s.kind === "motion") {
    return (
      <div className={`loupe-pv__band loupe-pv__band--${as}`} data-loupe-pv-slot={band.slot}>
        <Specimen config={config} spec={s} alt={o.label} />
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  if (s.kind === "layoutMock") {
    return (
      <div className={`loupe-pv__band loupe-pv__band--${as}`} data-loupe-pv-slot={band.slot}>
        <div className="loupe-pv__mock">
          <Specimen config={config} spec={s} alt={o.label} />
        </div>
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  if (s.kind === "palette") {
    return (
      <div className="loupe-pv__band loupe-pv__band--swatch" data-loupe-pv-slot={band.slot}>
        <div className="loupe-pv__swatches">
          <PaletteSwatches colors={s.colors} />
        </div>
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  if (s.kind === "decision") {
    return (
      <div className="loupe-pv__band loupe-pv__band--decision" data-loupe-pv-slot={band.slot}>
        <span className="loupe-pv__decision">{s.summary}</span>
        <span className="loupe-pv__tag">{labelText}</span>
      </div>
    );
  }
  // type
  return (
    <div className="loupe-pv__band loupe-pv__band--headline" data-loupe-pv-slot={band.slot}>
      <span
        className="loupe-pv__headline"
        style={{ fontFamily: s.family, fontWeight: s.weight ?? 700 }}
      >
        {s.sample}
      </span>
      <span className="loupe-pv__tag">{labelText}</span>
    </div>
  );
}

function ComposedPreview({
  config,
  sel,
}: {
  config: Config;
  sel: Selections;
}): ReactNode {
  const model = selectComposedPreview(config, sel);
  const anyLocked = model.bands.some((b) => b.option || b.writeIn);
  if (!anyLocked) {
    return (
      <div className="loupe-pv" data-loupe-preview>
        <div className="loupe-pv__empty">
          Lock a few tiles —<br />the live preview composes here.
        </div>
      </div>
    );
  }
  return (
    <div className="loupe-pv" data-loupe-preview>
      <div className="loupe-pv__frame">
        {model.headline ? (
          <div className="loupe-pv__heading">
            <span className="loupe-pv__heading-k">{config.title ?? "Preview"}</span>
            <span className="loupe-pv__heading-h">{model.headline}</span>
          </div>
        ) : null}
        {model.bands.map((b) => (
          <PreviewBandView key={b.slot} config={config} band={b} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sticky stack (preview + thumbs + controls) and export brief.
 * ------------------------------------------------------------------ */

function Stack({
  config,
  sel,
  store,
  onCopyStatus,
}: {
  config: Config;
  sel: Selections;
  store: LoupeStore;
  onCopyStatus: (msg: string) => void;
}): ReactNode {
  const { locked, total } = selectProgress(config, sel);
  return (
    <aside className="loupe-stack" data-loupe-stack aria-label="Composed preview">
      <button
        type="button"
        className="loupe-stack__handle"
        data-loupe-sheet-toggle
        aria-expanded={false}
        onClick={toggleSheet}
      >
        <span className="loupe-stack__grip" aria-hidden="true" />
        <span className="loupe-stack__handle-label">Live preview</span>
        <span className="loupe-stack__handle-count">
          <b data-loupe-progress>{locked}</b>/{total} ›
        </span>
      </button>
      <div className="loupe-stack__head">
        <div>
          <h3 className="loupe-stack__title">Composed preview</h3>
          <div className="loupe-stack__sub">Live from your picks</div>
        </div>
        <span className="loupe-stack__sub">
          <b data-loupe-progress>{locked}</b> / {total}
        </span>
      </div>
      <div className="loupe-stack__scroll">
        <div className="loupe-stack__preview-wrap" data-loupe-preview-wrap>
          <ComposedPreview config={config} sel={sel} />
        </div>
        <div className="loupe-stack__thumbs">
          <h4 className="loupe-stack__thumbs-title">Your picks</h4>
          <div data-loupe-thumbs-wrap>
            <Thumbs config={config} sel={sel} store={store} />
          </div>
        </div>
        <div className="loupe-stack__foot">
          <button
            type="button"
            className="loupe-btn loupe-btn--signal"
            data-loupe-recommend
            onClick={() => {
              store.reset();
              onCopyStatus("Recommended stack loaded.");
            }}
          >
            Recommended
          </button>
          <button
            type="button"
            className="loupe-btn loupe-btn--ghost"
            data-loupe-reset
            onClick={() => {
              store.clearAll();
              onCopyStatus("Cleared to blank.");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="loupe-btn loupe-btn--primary"
            data-loupe-scroll-brief
            onClick={scrollToBrief}
          >
            Brief
          </button>
        </div>
      </div>
    </aside>
  );
}

function toggleSheet(ev: ReactMouseEvent<HTMLButtonElement>): void {
  if (typeof document === "undefined") return;
  const root = ev.currentTarget.closest<HTMLElement>("[data-loupe-root]");
  const stack = root?.querySelector<HTMLElement>("[data-loupe-stack]");
  const open = stack?.classList.toggle("loupe-stack--open") ?? false;
  ev.currentTarget.setAttribute("aria-expanded", String(open));
}

function scrollToBrief(): void {
  if (typeof document === "undefined") return;
  document.getElementById("loupe-brief")?.scrollIntoView({ behavior: "smooth" });
}

function ExportBrief({
  config,
  sel,
  store,
  status,
  onCopyStatus,
}: {
  config: Config;
  sel: Selections;
  store: LoupeStore;
  status: string;
  onCopyStatus: (msg: string) => void;
}): ReactNode {
  const brief = selectExportBrief(config, sel);

  const onCopy = useCallback(() => {
    const md = selectExportBrief(config, store.getSnapshot()).markdown;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.clipboard?.writeText) {
      nav.clipboard.writeText(md).then(
        () => onCopyStatus("Brief copied."),
        () => onCopyStatus("Selected — press Cmd/Ctrl+C."),
      );
    } else {
      onCopyStatus("Selected — press Cmd/Ctrl+C.");
    }
  }, [config, store, onCopyStatus]);

  return (
    <section className="loupe-export" id="loupe-brief">
      <div className="loupe-export__head">
        <h2 className="loupe-export__title">Build brief</h2>
        <p className="loupe-export__lead">
          The deterministic handoff for the next build pass. Stays in sync with your locked tiles.
        </p>
        <div className="loupe-export__actions">
          <button type="button" className="loupe-btn loupe-btn--primary" data-loupe-copy onClick={onCopy}>
            Copy brief
          </button>
          <button
            type="button"
            className="loupe-btn loupe-btn--ghost"
            data-loupe-reset
            onClick={() => {
              store.clearAll();
              onCopyStatus("Cleared to blank.");
            }}
          >
            Reset decisions
          </button>
        </div>
        <p className="loupe-export__status" data-loupe-status aria-live="polite">
          {status}
        </p>
      </div>
      <textarea
        className="loupe-export__brief"
        data-loupe-brief
        spellCheck={false}
        aria-label="Generated build brief"
        readOnly
        value={brief.markdown}
      />
      {config.workflow?.length ? (
        <section className="loupe-workflow" id="loupe-workflow">
          <h3 className="loupe-workflow__title">Workflow</h3>
          <ul className="loupe-workflow__list">
            {config.workflow.map((w, i) => (
              <li key={i} className="loupe-workflow__item">
                {w}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {config.banned?.length ? (
        <section className="loupe-banned" id="loupe-banned">
          <h3 className="loupe-banned__title">Banned</h3>
          <ul className="loupe-banned__list">
            {config.banned.map((b, i) => (
              <li key={i} className="loupe-banned__item">
                <span aria-hidden="true">✕</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function ProgressPill({
  config,
  sel,
}: {
  config: Config;
  sel: Selections;
}): ReactNode {
  const { locked, total } = selectProgress(config, sel);
  return (
    <span className="loupe-pill" aria-live="polite">
      <b data-loupe-progress>{locked}</b> of {total} locked
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * useLoupe — create the store once, subscribe via useSyncExternalStore.
 * ------------------------------------------------------------------ */

export interface UseLoupeOptions {
  /** localStorage key; when set, selections persist. Omit for ephemeral. */
  storageKey?: string;
  /** Initial selections (overrides storage + recommended). */
  initial?: Selections;
  /** Provide a storage port directly (overrides storageKey). */
  storage?: StoragePort;
  /** Provide an existing store (e.g. shared across components). */
  store?: LoupeStore;
}

export interface UseLoupeResult {
  store: LoupeStore;
  /** Current selections (stable cached snapshot from core). */
  selections: Selections;
}

/**
 * Headless hook: own a core store for `config` and track its snapshot through
 * React 19 `useSyncExternalStore` (client snapshot + deterministic server
 * snapshot → SSR/hydration-safe). The store is created once and reused while
 * `config` keeps the same identity; pass a stable `config` (module constant or
 * memoized) to avoid resets.
 */
export function useLoupe(config: Config, opts: UseLoupeOptions = {}): UseLoupeResult {
  const { storageKey, initial, storage, store: provided } = opts;

  // Create the store once, keyed on config identity. A ref guards against
  // React's double-invoke in dev and keeps the store stable across renders.
  const ref = useRef<{ config: Config; store: LoupeStore } | null>(null);
  const store = useMemo(() => {
    if (provided) return provided;
    if (ref.current && ref.current.config === config) return ref.current.store;
    const created = createLoupeStore(config, {
      initial,
      storage: storage ?? (storageKey ? localStorageAdapter(storageKey) : undefined),
    });
    ref.current = { config, store: created };
    return created;
    // initial/storage/storageKey are read only at creation time (store owns
    // state thereafter); config identity is the reset key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, provided]);

  const selections = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return { store, selections };
}

/* ------------------------------------------------------------------ *
 * <Loupe /> — the full interactive UI, a thin view over the store.
 * ------------------------------------------------------------------ */

export interface LoupeProps {
  config: Config;
  /** Theme tokens applied as inline `--loupe-*` CSS vars on the root. */
  theme?: TThemeTokens;
  /** Called whenever the selection state changes (locks/clears/resets). */
  onLockChange?: (selections: Selections) => void;
  /** localStorage key; when set, selections persist. Omit for ephemeral. */
  storageKey?: string;
}

/**
 * The full interactive decision-lock UI. Structurally equivalent to
 * `loupe-dom`'s `renderApp` (same parts/ARIA), so the shared
 * `@lucentive-labs/loupe-dom/styles.css` styles it directly.
 *
 * Import the stylesheet once in your app:
 * ```ts
 * import "@lucentive-labs/loupe-dom/styles.css";
 * ```
 */
export function Loupe({
  config,
  theme,
  onLockChange,
  storageKey,
}: LoupeProps): ReactNode {
  const { store, selections } = useLoupe(config, { storageKey });

  // The React adapter renders the "page" layout. The guided "flow" stepper (the
  // generator/DOM default) is not implemented here yet, so warn — as a
  // post-commit effect, not during render — whenever the effective layout is
  // flow, including the omitted default. Pass layout:"page" to silence.
  useEffect(() => {
    if ((config.layout ?? "flow") === "flow") {
      console.warn(
        '[loupe] <Loupe> renders the "page" layout; the guided "flow" stepper is generator/DOM-only for now. Pass layout:"page" to silence this.',
      );
    }
  }, [config.layout]);

  // Fire onLockChange after commit whenever the snapshot identity changes.
  const lastSel = useRef<Selections | null>(null);
  if (onLockChange && lastSel.current !== selections) {
    lastSel.current = selections;
    // Defer to a microtask so we never call back synchronously during render.
    queueMicrotask(() => onLockChange(selections));
  }

  // Transient status line for copy/reset/recommend actions (mirrors mount.ts
  // flash, but as React state).
  const [status, setStatus] = useStatus();

  // Theme tokens → inline CSS vars on the root (theme prop overrides
  // config.theme, matching applyTheme precedence).
  const styleVars = useMemo(
    () => tokensToCssVars(theme ?? config.theme) as CSSProperties,
    [theme, config.theme],
  );

  const title = config.title ?? "Loupe decision lock";

  return (
    <div className="loupe loupe-host" data-loupe-root style={styleVars}>
      <header className="loupe-header">
        <div className="loupe-header__inner">
          <div className="loupe-header__title">{title}</div>
          <ProgressPill config={config} sel={selections} />
        </div>
      </header>
      <main className="loupe-main">
        <section className="loupe-lab">
          <div className="loupe-lab__grid">
            <div className="loupe-groups" data-loupe-groups>
              {config.groups.map((g, i) => (
                <Group
                  key={g.id}
                  config={config}
                  group={g}
                  sel={selections}
                  index={i}
                  store={store}
                />
              ))}
            </div>
            <Stack config={config} sel={selections} store={store} onCopyStatus={setStatus} />
          </div>
        </section>
        <ExportBrief
          config={config}
          sel={selections}
          store={store}
          status={status}
          onCopyStatus={setStatus}
        />
      </main>
    </div>
  );
}

/** Tiny status-line state with auto-clear, mirroring mount.ts `flash`. */
function useStatus(): [string, (msg: string) => void] {
  const [value, setValue] = useState("");
  const set = useCallback((msg: string) => {
    setValue(msg);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setValue(""), 1900);
    }
  }, []);
  return [value, set];
}

export type { Config, Selections, LoupeStore };
