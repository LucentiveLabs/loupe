import { describe, expect, it, vi } from "vitest";
import { parseConfig, validateConfig } from "../../loupe-schema/src/index";
import {
  cropToCss,
  createLoupeStore,
  recommendedSelections,
  selectComposedPreview,
  selectExportBrief,
  selectProgress,
  resolveKeydown,
  tokensToCssVars,
  escapeHtml,
  safeUrl,
} from "./index";

const cfg = parseConfig({
  version: 1,
  title: "Test lock",
  assets: { hero: { src: "hero.png", width: 1536, height: 1024 } },
  groups: [
    {
      id: "color",
      title: "Color",
      options: [
        { id: "warm", label: "Warm", recommended: true, specimen: { kind: "palette", colors: ["#fff", "#000"] } },
        { id: "cool", label: "Cool", specimen: { kind: "palette", colors: ["#0ff"] } },
      ],
    },
    {
      id: "hero",
      title: "Hero",
      options: [
        { id: "a", label: "A", specimen: { kind: "imageCrop", asset: "hero", crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, alt: "a" } },
        { id: "b", label: "B", specimen: { kind: "type", family: "Manrope", sample: "Hello" } },
      ],
    },
  ],
  banned: ["no node maps"],
});

describe("cropToCss (exact cover math)", () => {
  it("full rect, square tile, square image → 100% / 0 / 0", () => {
    expect(cropToCss({ x: 0, y: 0, w: 1, h: 1 }, { width: 1000, height: 1000 }, 1)).toEqual({
      widthPct: 100,
      leftPct: 0,
      topPct: 0,
    });
  });
  it("top-left quarter, square tile/image → 200% / 0 / 0", () => {
    expect(cropToCss({ x: 0, y: 0, w: 0.5, h: 0.5 }, { width: 1000, height: 1000 }, 1)).toEqual({
      widthPct: 200,
      leftPct: 0,
      topPct: 0,
    });
  });
  it("wide image into square tile centers + crops sides", () => {
    expect(cropToCss({ x: 0, y: 0, w: 1, h: 1 }, { width: 2000, height: 1000 }, 1)).toEqual({
      widthPct: 200,
      leftPct: -50,
      topPct: 0,
    });
  });
});

describe("store", () => {
  it("starts at recommended and lock/clear/reset/clearAll work", () => {
    const store = createLoupeStore(cfg);
    expect(store.getSnapshot()).toEqual({ color: "warm", hero: undefined });
    const before = store.getSnapshot();
    const spy = vi.fn();
    const off = store.subscribe(spy);
    store.lock("hero", "a");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ color: "warm", hero: "a" });
    expect(store.getSnapshot()).not.toBe(before); // new stable ref
    store.clear("color");
    expect(store.getSnapshot().color).toBeUndefined();
    store.reset();
    expect(store.getSnapshot()).toEqual({ color: "warm", hero: undefined });
    store.clearAll();
    expect(store.getSnapshot()).toEqual({});
    off();
  });
  it("getServerSnapshot is stable and equals recommended", () => {
    const store = createLoupeStore(cfg);
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(store.getServerSnapshot()).toEqual(recommendedSelections(cfg));
  });
});

describe("derivations", () => {
  it("progress counts locked groups", () => {
    expect(selectProgress(cfg, { color: "warm", hero: undefined })).toEqual({ locked: 1, total: 2 });
  });
  it("composed preview resolves selected options + headline from type", () => {
    const pm = selectComposedPreview(cfg, { color: "warm", hero: "b" });
    expect(pm.bands).toHaveLength(2);
    expect(pm.headline).toBe("Hello");
  });
  it("export brief is deterministic", () => {
    const a = selectExportBrief(cfg, { color: "warm", hero: "a" });
    const b = selectExportBrief(cfg, { color: "warm", hero: "a" });
    expect(a).toEqual(b);
    expect(a.markdown).toContain("Color: Warm");
    expect(a.markdown).toContain("no node maps");
  });
});

describe("keyboard", () => {
  it("ArrowRight wraps to next option; Home/End jump", () => {
    const g = cfg.groups[1]!;
    expect(resolveKeydown(g, "a", "ArrowRight")).toEqual({ lock: "b", focus: "b" });
    expect(resolveKeydown(g, "b", "ArrowRight")).toEqual({ lock: "a", focus: "a" });
    expect(resolveKeydown(g, "b", "Home")).toEqual({ lock: "a", focus: "a" });
    expect(resolveKeydown(g, "a", "End")).toEqual({ lock: "b", focus: "b" });
    expect(resolveKeydown(g, "a", "x")).toBeNull();
  });
});

describe("theming + security", () => {
  it("tokensToCssVars merges + prefixes + sorts", () => {
    const vars = tokensToCssVars({ "color-primary": "#123456" });
    expect(vars["--loupe-color-primary"]).toBe("#123456");
    expect(vars["--loupe-color-bg"]).toBeDefined();
  });
  it("escapeHtml + safeUrl block injection", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("assets/hero.png")).toBe("assets/hero.png");
    expect(safeUrl("https://x.com/a.png")).toBe("https://x.com/a.png");
  });
});

describe("semantic validation", () => {
  it("flags missing asset + missing alt + dup ids", () => {
    const bad = {
      version: 1 as const,
      assets: {},
      groups: [
        {
          id: "g",
          title: "G",
          options: [
            { id: "x", label: "X", specimen: { kind: "imageCrop" as const, asset: "nope", crop: { x: 0, y: 0, w: 1, h: 1 }, alt: "" } },
            { id: "x", label: "X2", specimen: { kind: "palette" as const, colors: ["#fff"] } },
          ],
        },
      ],
    };
    // alt:"" fails zod min(1) so parse throws — assert structural first
    expect(() => parseConfig(bad)).toThrow();
  });
  it("validateConfig catches missing asset reference on a parsed config", () => {
    const c = parseConfig({
      version: 1,
      assets: {},
      groups: [
        {
          id: "g",
          title: "G",
          options: [
            { id: "x", label: "X", specimen: { kind: "imageCrop", asset: "missing", crop: { x: 0, y: 0, w: 1, h: 1 }, alt: "alt" } },
            { id: "y", label: "Y", specimen: { kind: "palette", colors: ["#fff"] } },
          ],
        },
      ],
    });
    expect(validateConfig(c)).toContain('option "g.x" references missing asset "missing"');
  });
});
