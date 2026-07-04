import { describe, expect, it, vi } from "vitest";
import { parseConfig, validateConfig } from "../../loupe-schema/src/index";
import {
  cropToCss,
  createLoupeStore,
  groupAllowsWriteIn,
  recommendedSelections,
  selectComposedPreview,
  selectExportBrief,
  selectProgress,
  selectedWriteIn,
  resolveKeydown,
  tokensToCssVars,
  escapeHtml,
  safeUrl,
  writeInKey,
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

describe("write-ins ('something else')", () => {
  // Open group (write-in by default), an opted-out group, and a locked group.
  const wcfg = parseConfig({
    version: 1,
    title: "Write-in lock",
    assets: {},
    groups: [
      {
        id: "tone",
        title: "Tone",
        options: [
          { id: "calm", label: "Calm", recommended: true, specimen: { kind: "decision", summary: "Calm voice." } },
          { id: "bold", label: "Bold", specimen: { kind: "decision", summary: "Bold voice." } },
        ],
      },
      {
        id: "name",
        title: "Name",
        allowWriteIn: false,
        options: [
          { id: "alpha", label: "Alpha", specimen: { kind: "decision", summary: "Alpha." } },
          { id: "beta", label: "Beta", specimen: { kind: "decision", summary: "Beta." } },
        ],
      },
      {
        id: "license",
        title: "License",
        locked: true,
        options: [
          { id: "mit", label: "MIT", recommended: true, specimen: { kind: "decision", summary: "MIT." } },
        ],
      },
    ],
  });
  const [tone, name, license] = wcfg.groups;

  it("groupAllowsWriteIn: open groups default true; suppressed/locked are false", () => {
    expect(groupAllowsWriteIn(tone!)).toBe(true);
    expect(groupAllowsWriteIn(name!)).toBe(false);
    expect(groupAllowsWriteIn(license!)).toBe(false);
  });

  it("selectedWriteIn trims, and ignores suppressed/locked groups", () => {
    const sel = {
      [writeInKey("tone")]: "  velvet tone  ",
      [writeInKey("name")]: "custom name",
      [writeInKey("license")]: "actually GPL",
    };
    expect(selectedWriteIn(tone!, sel)).toBe("velvet tone");
    expect(selectedWriteIn(name!, sel)).toBe("");
    expect(selectedWriteIn(license!, sel)).toBe("");
  });

  it("store.writeIn commits under the reserved key; '' removes it", () => {
    const store = createLoupeStore(wcfg);
    store.writeIn("tone", "hand-rolled");
    expect(store.getSnapshot()[writeInKey("tone")]).toBe("hand-rolled");
    store.writeIn("tone", "");
    expect(writeInKey("tone") in store.getSnapshot()).toBe(false);
  });

  it("store refuses write-ins for locked, suppressed, and unknown groups", () => {
    const store = createLoupeStore(wcfg);
    const before = store.getSnapshot();
    store.writeIn("name", "nope");
    store.writeIn("license", "nope");
    store.writeIn("ghost", "nope");
    expect(store.getSnapshot()).toBe(before); // no commit at all
  });

  it("clear() drops the pick AND the write-in; reset/clearAll wipe write-ins", () => {
    const store = createLoupeStore(wcfg);
    store.writeIn("tone", "velvet");
    store.clear("tone");
    expect(store.getSnapshot().tone).toBeUndefined();
    expect(writeInKey("tone") in store.getSnapshot()).toBe(false);
    store.writeIn("tone", "velvet");
    store.reset();
    expect(writeInKey("tone") in store.getSnapshot()).toBe(false);
    store.writeIn("tone", "velvet");
    store.clearAll();
    expect(store.getSnapshot()).toEqual({ license: "mit" }); // locked pin only
  });

  it("progress counts a write-in-only group as decided", () => {
    const sel = { [writeInKey("tone")]: "velvet" };
    expect(selectProgress(wcfg, sel)).toEqual({ locked: 1, total: 3 });
    // ...but not for a suppressed group, and blank text counts as nothing.
    expect(selectProgress(wcfg, { [writeInKey("name")]: "x" })).toEqual({ locked: 0, total: 3 });
    expect(selectProgress(wcfg, { [writeInKey("tone")]: "   " })).toEqual({ locked: 0, total: 3 });
  });

  it("brief: a write-in alongside a locked option is an appended note (md + json)", () => {
    const sel = { tone: "calm", license: "mit", [writeInKey("tone")]: " warmer than calm " };
    const brief = selectExportBrief(wcfg, sel);
    expect(brief.markdown).toContain('- Tone: Calm — write-in: "warmer than calm"');
    const decisions = brief.json.decisions as Array<Record<string, unknown>>;
    expect(decisions[0]).toMatchObject({ group: "tone", optionId: "calm", writeIn: "warmer than calm" });
  });

  it("brief: a write-in with no locked option IS the decision (md + json)", () => {
    const sel = { license: "mit", [writeInKey("tone")]: "something new entirely" };
    const brief = selectExportBrief(wcfg, sel);
    expect(brief.markdown).toContain('- Tone: [WRITE-IN] "something new entirely"');
    const decisions = brief.json.decisions as Array<Record<string, unknown>>;
    expect(decisions[0]).toMatchObject({ group: "tone", optionId: null, label: null, writeIn: "something new entirely" });
  });

  it("brief: empty/blank write-ins change nothing; existing json keys stay stable", () => {
    const base = selectExportBrief(wcfg, { tone: "calm", license: "mit" });
    const blank = selectExportBrief(wcfg, { tone: "calm", license: "mit", [writeInKey("tone")]: "  " });
    expect(blank).toEqual(base);
    const d = (base.json.decisions as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(d)).toEqual(["group", "title", "optionId", "label", "locked", "flags", "deviation", "writeIn"]);
    expect(d.writeIn).toBeNull();
  });

  it("brief: allowWriteIn:false and locked groups ignore stray write-in state", () => {
    const sel = {
      license: "mit",
      [writeInKey("name")]: "custom name",
      [writeInKey("license")]: "actually GPL",
    };
    const brief = selectExportBrief(wcfg, sel);
    expect(brief.markdown).toContain("- Name: (open)");
    expect(brief.markdown).toContain("- [LOCKED] License: MIT");
    expect(brief.markdown).not.toContain("write-in");
    const decisions = brief.json.decisions as Array<Record<string, unknown>>;
    expect(decisions[1]!.writeIn).toBeNull();
    expect(decisions[2]!.writeIn).toBeNull();
  });

  it("composed preview bands carry the effective write-in", () => {
    const pm = selectComposedPreview(wcfg, { [writeInKey("tone")]: "velvet" });
    expect(pm.bands[0]).toMatchObject({ slot: "tone", option: null, writeIn: "velvet" });
    expect(pm.bands[1]!.writeIn).toBe("");
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
