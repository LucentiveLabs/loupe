import { describe, expect, it } from "vitest";
import {
  type Config,
  Rect,
  Specimen,
  parseConfig,
  toJsonSchema,
  validateConfig,
} from "./index";

describe("Rect bounds", () => {
  it("accepts an in-bounds rect", () => {
    expect(Rect.safeParse({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }).success).toBe(true);
  });
  it("rejects zero-area and out-of-bounds rects", () => {
    expect(Rect.safeParse({ x: 0, y: 0, w: 0, h: 0.5 }).success).toBe(false);
    expect(Rect.safeParse({ x: 0.8, y: 0, w: 0.5, h: 0.5 }).success).toBe(false);
    expect(Rect.safeParse({ x: 0, y: 0.9, w: 0.5, h: 0.5 }).success).toBe(false);
  });
});

describe("Specimen discriminated union", () => {
  it("rejects an unknown kind", () => {
    expect(Specimen.safeParse({ kind: "nope" }).success).toBe(false);
  });
  it("accepts a valid imageCrop", () => {
    expect(
      Specimen.safeParse({
        kind: "imageCrop",
        asset: "a",
        crop: { x: 0, y: 0, w: 1, h: 1 },
        alt: "hi",
      }).success,
    ).toBe(true);
  });
});

describe("toJsonSchema", () => {
  it("emits an object schema with properties (agent contract)", () => {
    const js = toJsonSchema();
    expect(js).toBeTypeOf("object");
    expect((js as { properties?: unknown }).properties).toBeDefined();
  });
});

describe("allowWriteIn (the 'something else' write-in contract)", () => {
  const twoOptions = [
    { id: "x", label: "X", specimen: { kind: "palette" as const, colors: ["#fff"] } },
    { id: "y", label: "Y", specimen: { kind: "palette" as const, colors: ["#000"] } },
  ];

  it("is optional and stays absent when omitted (open groups default to allowed)", () => {
    const c = parseConfig({
      version: 1,
      assets: {},
      groups: [{ id: "g", title: "G", options: twoOptions }],
    });
    // Omitted = undefined; renderers treat that as allowed (default-true).
    expect(c.groups[0]!.allowWriteIn).toBeUndefined();
    expect(validateConfig(c)).toEqual([]);
  });

  it("accepts an explicit opt-out on an open group", () => {
    const c = parseConfig({
      version: 1,
      assets: {},
      groups: [{ id: "g", title: "G", allowWriteIn: false, options: twoOptions }],
    });
    expect(c.groups[0]!.allowWriteIn).toBe(false);
    expect(validateConfig(c)).toEqual([]);
  });

  it("rejects allowWriteIn:true on a locked group (decided context) at parse", () => {
    expect(() =>
      parseConfig({
        version: 1,
        assets: {},
        groups: [
          {
            id: "g",
            title: "G",
            locked: true,
            allowWriteIn: true,
            options: [{ id: "x", label: "X", recommended: true, specimen: { kind: "palette", colors: ["#fff"] } }],
          },
        ],
      }),
    ).toThrow();
  });

  it("validateConfig flags the locked+allowWriteIn contradiction on a built config", () => {
    // Hand-built (unparsed) config, as validateConfig also guards programmatic use.
    const c: Config = {
      version: 1,
      assets: {},
      groups: [
        {
          id: "g",
          title: "G",
          locked: true,
          allowWriteIn: true,
          options: [{ id: "x", label: "X", recommended: true, specimen: { kind: "palette", colors: ["#fff"] } }],
        },
      ],
    };
    expect(validateConfig(c)).toContain(
      'locked group "g" cannot allow a write-in (locked groups are decided context)',
    );
  });

  it("rejects group ids in the reserved '~' selection-state namespace", () => {
    const c = parseConfig({
      version: 1,
      assets: {},
      groups: [{ id: "~writeIn:g", title: "G", options: twoOptions }],
    });
    expect(validateConfig(c)).toContain(
      'group id "~writeIn:g" must not start with "~" (reserved for internal selection-state keys)',
    );
  });
});

describe("editorial flow fields (question / promptLead / collapsible prompt)", () => {
  const twoOptions = [
    { id: "x", label: "X", specimen: { kind: "palette" as const, colors: ["#fff"] } },
    { id: "y", label: "Y", specimen: { kind: "palette" as const, colors: ["#000"] } },
  ];

  it("parses question, promptLead, promptCollapsible, and promptSummary", () => {
    const c = parseConfig({
      version: 1,
      question: "Which direction?",
      assets: {},
      groups: [
        {
          id: "g",
          title: "G",
          question: "Which palette carries the brand?",
          prompt: "A long brief with all the context.",
          promptLead: "Pick the palette that carries the brand.",
          promptCollapsible: true,
          promptSummary: "Read the full brief",
          options: twoOptions,
        },
      ],
    });
    expect(c.question).toBe("Which direction?");
    expect(c.groups[0]!.question).toBe("Which palette carries the brand?");
    expect(c.groups[0]!.promptLead).toBe("Pick the palette that carries the brand.");
    expect(c.groups[0]!.promptCollapsible).toBe(true);
    expect(c.groups[0]!.promptSummary).toBe("Read the full brief");
    expect(validateConfig(c)).toEqual([]);
  });

  it("rejects promptCollapsible without a prompt to collapse", () => {
    expect(() =>
      parseConfig({
        version: 1,
        assets: {},
        groups: [{ id: "g", title: "G", promptCollapsible: true, options: twoOptions }],
      }),
    ).toThrow();
  });

  it("rejects promptSummary without promptCollapsible", () => {
    expect(() =>
      parseConfig({
        version: 1,
        assets: {},
        groups: [
          {
            id: "g",
            title: "G",
            prompt: "Some context.",
            promptSummary: "Full context",
            options: twoOptions,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("validateConfig preview refs", () => {
  it("flags a preview band that references a missing group", () => {
    const c = parseConfig({
      version: 1,
      assets: {},
      groups: [
        {
          id: "g",
          title: "G",
          options: [
            { id: "x", label: "X", specimen: { kind: "palette", colors: ["#fff"] } },
            { id: "y", label: "Y", specimen: { kind: "palette", colors: ["#000"] } },
          ],
        },
      ],
      preview: { bands: [{ slot: "s", fromGroup: "ghost" }] },
    });
    expect(validateConfig(c)).toContain(
      'preview band "s" references missing group "ghost"',
    );
  });
});

describe("glanceability field edges", () => {
  const twoOpts = [
    { id: "x", label: "X", specimen: { kind: "palette" as const, colors: ["#fff"] } },
    { id: "y", label: "Y", specimen: { kind: "palette" as const, colors: ["#000"] } },
  ];
  const base = (group: Record<string, unknown>) => ({
    version: 1 as const,
    assets: {},
    groups: [{ id: "g", title: "G", options: twoOpts, ...group }],
  });

  it("rejects empty-string question / promptLead / promptSummary", () => {
    expect(() => parseConfig(base({ question: "" }))).toThrow();
    expect(() => parseConfig(base({ promptLead: "" }))).toThrow();
    expect(() =>
      parseConfig(base({ prompt: "ctx", promptCollapsible: true, promptSummary: "" })),
    ).toThrow();
    expect(() => parseConfig({ ...base({}), question: "" })).toThrow();
  });

  it("validateConfig mirrors the prompt-disclosure refinements", () => {
    const good = parseConfig(base({ prompt: "ctx", promptCollapsible: true }));
    // Simulate programmatic Config values that never went through parseConfig.
    const noPrompt = structuredClone(good);
    delete (noPrompt.groups[0] as Record<string, unknown>).prompt;
    expect(validateConfig(noPrompt)).toContain(
      'group "g" sets promptCollapsible without a prompt to collapse',
    );
    const summaryOnly = structuredClone(good);
    delete (summaryOnly.groups[0] as Record<string, unknown>).promptCollapsible;
    (summaryOnly.groups[0] as Record<string, unknown>).promptSummary = "Brief";
    expect(validateConfig(summaryOnly)).toContain(
      'group "g" sets promptSummary without promptCollapsible',
    );
  });
});
