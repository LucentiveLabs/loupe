import { describe, expect, it } from "vitest";
import { Rect, Specimen, parseConfig, toJsonSchema, validateConfig } from "./index";

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
