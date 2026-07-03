/**
 * Renderer parity (spec §0.6): `loupe-dom` is the canonical renderer; this test
 * asserts the React adapter emits STRUCTURALLY EQUIVALENT DOM/ARIA for the same
 * config + state. We do not require byte-identical HTML (React serializes
 * attributes in its own order, self-closes differently, etc.) — we assert the
 * semantic invariants a screen reader and the stylesheet depend on.
 *
 * Relative imports throughout so no install/link/build step is required.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseConfig } from "../../loupe-schema/src/index";
import { recommendedSelections } from "../../loupe-core/src/index";
import { renderToString } from "../../loupe-dom/src/index";
import { Loupe } from "./index";

const cfg = parseConfig({
  version: 1,
  // Parity is defined against the shared "page" layout (the React adapter does
  // not yet implement the "flow" stepper); pin it so both renderers agree.
  layout: "page",
  title: "Parity lock",
  assets: {
    hero: { src: "hero.png", width: 1536, height: 1024 },
    wide: { src: "wide.png", width: 2000, height: 1000 },
  },
  groups: [
    {
      id: "color",
      title: "Color",
      prompt: "Pick a palette",
      options: [
        { id: "warm", label: "Warm", recommended: true, specimen: { kind: "palette", colors: ["#fff", "#000"] } },
        { id: "cool", label: "Cool", caption: "icy", specimen: { kind: "palette", colors: ["#0ff"], over: "wide" } },
      ],
    },
    {
      id: "hero",
      title: "Hero",
      options: [
        { id: "crop", label: "Crop", specimen: { kind: "imageCrop", asset: "hero", crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, alt: "hero crop" } },
        { id: "headline", label: "Headline", recommended: true, specimen: { kind: "type", family: "Manrope", weight: 800, sample: "Soft Data Body", kicker: "Kicker" } },
      ],
    },
    {
      id: "motion",
      title: "Motion",
      options: [
        { id: "breathe", label: "Breathe", recommended: true, specimen: { kind: "motion", preset: "breathe", asset: "hero", crop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 } } },
        { id: "pan", label: "Pan", specimen: { kind: "motion", preset: "pan", asset: "hero", asset2: "wide" } },
        { id: "field", label: "Field", specimen: { kind: "motion", preset: "field", asset: "wide" } },
      ],
    },
    {
      id: "layout",
      title: "Layout",
      options: [
        { id: "portrait", label: "Portrait", recommended: true, specimen: { kind: "layoutMock", plan: "portrait", asset: "hero", crop: { x: 0, y: 0, w: 1, h: 1 } } },
        { id: "threshold", label: "Threshold", specimen: { kind: "layoutMock", plan: "threshold", asset: "hero", asset2: "wide" } },
      ],
    },
    {
      id: "call",
      title: "Naming call",
      prompt: "What do we ship as?",
      options: [
        { id: "loupe", label: "Loupe", recommended: true, specimen: { kind: "decision", summary: "Ship as Loupe", detail: "the lens metaphor", flags: ["reversible"] } },
        { id: "aperture", label: "Aperture", specimen: { kind: "decision", summary: "Ship as Aperture" } },
      ],
    },
    {
      id: "license",
      title: "License",
      locked: true,
      options: [
        { id: "mit", label: "MIT", recommended: true, specimen: { kind: "decision", summary: "MIT license", flags: ["decided"] } },
      ],
    },
  ],
  preview: {
    bands: [
      { slot: "headline", fromGroup: "hero", as: "headline" },
      { slot: "palette", fromGroup: "color", as: "swatch" },
      { slot: "motion", fromGroup: "motion", as: "feature" },
      { slot: "layout", fromGroup: "layout", as: "band" },
    ],
    headlineFrom: "hero",
  },
  banned: ["no node maps", "no neon gradients"],
  workflow: ["author", "generate", "screenshot"],
});

const sel = recommendedSelections(cfg);

const domHtml = renderToString(cfg, sel);
const reactHtml = renderToStaticMarkup(<Loupe config={cfg} />);

/** All values of a given attribute, in document order. */
function attrValues(html: string, attr: string): string[] {
  const re = new RegExp(`${attr}="([^"]*)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]!);
  return out;
}

/** Count occurrences of a literal attribute=value token. */
function countAttr(html: string, attr: string, value: string): number {
  return attrValues(html, attr).filter((v) => v === value).length;
}

/**
 * The set of option ids whose tile is aria-checked. React serializes
 * aria-checked as the string "true"/"false"; loupe-dom does the same. We pair
 * each tile's data-option with the aria-checked that follows it on the same
 * <button>, robust to attribute ordering by scanning per-button slices.
 */
function checkedOptionIds(html: string): Set<string> {
  const ids = new Set<string>();
  // Split into button chunks; each tile is a <button ...> element.
  const buttons = html.split("<button").slice(1);
  for (const b of buttons) {
    const chunk = b.slice(0, b.indexOf(">"));
    if (!/data-loupe-part="tile"/.test(chunk)) continue;
    const optM = /data-option="([^"]*)"/.exec(chunk);
    const checkedM = /aria-checked="(true|false)"/.exec(chunk);
    if (optM && checkedM && checkedM[1] === "true") ids.add(optM[1]!);
  }
  return ids;
}

describe("loupe-react ⇄ loupe-dom structural parity", () => {
  it("equal count of role=radio (one per option tile)", () => {
    const domN = countAttr(domHtml, "role", "radio");
    const reactN = countAttr(reactHtml, "role", "radio");
    const totalOptions = cfg.groups.reduce((n, g) => n + g.options.length, 0);
    expect(domN).toBe(totalOptions);
    expect(reactN).toBe(domN);
  });

  it("equal count of role=radiogroup (one per group)", () => {
    const domN = countAttr(domHtml, "role", "radiogroup");
    const reactN = countAttr(reactHtml, "role", "radiogroup");
    expect(domN).toBe(cfg.groups.length);
    expect(reactN).toBe(domN);
  });

  it("identical set of data-option ids", () => {
    const domIds = new Set(attrValues(domHtml, "data-option"));
    const reactIds = new Set(attrValues(reactHtml, "data-option"));
    const expected = new Set(
      cfg.groups.flatMap((g) => g.options.map((o) => o.id)),
    );
    expect([...reactIds].sort()).toEqual([...expected].sort());
    expect([...reactIds].sort()).toEqual([...domIds].sort());
  });

  it("identical aria-checked truth set (the recommended option per group)", () => {
    const domChecked = checkedOptionIds(domHtml);
    const reactChecked = checkedOptionIds(reactHtml);
    // Sanity: every group with a recommended option is represented.
    const expectedChecked = new Set(
      cfg.groups
        .map((g) => g.options.find((o) => o.recommended)?.id)
        .filter((x): x is string => Boolean(x)),
    );
    expect([...domChecked].sort()).toEqual([...expectedChecked].sort());
    expect([...reactChecked].sort()).toEqual([...domChecked].sort());
  });

  it("identical set of data-group ids on radiogroups", () => {
    const groupIds = (html: string) => {
      const set = new Set<string>();
      for (const seg of html.split("<div").concat(html.split("<section"))) {
        const chunk = seg.slice(0, seg.indexOf(">"));
        if (/role="radiogroup"/.test(chunk)) {
          const m = /data-group="([^"]*)"/.exec(chunk);
          if (m) set.add(m[1]!);
        }
      }
      return set;
    };
    const domG = groupIds(domHtml);
    const reactG = groupIds(reactHtml);
    expect([...reactG].sort()).toEqual([...new Set(cfg.groups.map((g) => g.id))].sort());
    expect([...reactG].sort()).toEqual([...domG].sort());
  });

  it("renders the composed-preview, picks, and export-brief landmarks", () => {
    for (const marker of [
      'data-loupe-preview',
      'data-loupe-thumbs',
      'id="loupe-brief"',
      'data-loupe-brief',
    ]) {
      expect(reactHtml).toContain(marker);
      expect(domHtml).toContain(marker);
    }
  });

  it("decision specimen + locked group render at parity (DOM ⇄ React)", () => {
    for (const marker of [
      "loupe-decision__summary", // decision specimen body
      "loupe-group--locked", // locked group class
      'aria-disabled="true"', // locked tiles are inert
      ">✓<", // decision thumbnail glyph in the "your picks" strip
    ]) {
      expect(domHtml).toContain(marker);
      expect(reactHtml).toContain(marker);
    }
  });
});
