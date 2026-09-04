import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseFrontmatter, themeFromDesign, themeFromDesignDir } from "./design-theme";

describe("parseFrontmatter", () => {
  it("parses nested maps and scalar values", () => {
    expect(
      parseFrontmatter(`---
colors:
  background: #f7f5f0
  accent: "#ff5a36" # brand color
typography:
  body:
    fontFamily: "Inter, sans-serif"
---
body
`),
    ).toEqual({
      colors: {
        background: "#f7f5f0",
        accent: "#ff5a36",
      },
      typography: {
        body: {
          fontFamily: "Inter, sans-serif",
        },
      },
    });
  });
});

describe("themeFromDesign", () => {
  it("maps design roles to Loupe theme tokens", () => {
    const { theme } = themeFromDesign({
      designMd: `---
colors:
  background: "#f7f5f0"
  card: "#ffffff"
  on-surface: "#171717"
  muted: "#737373"
  on-primary: "#ffffff"
  outline: "#d4d4d4"
  focus: "#2563eb"
  error: "#dc2626"
  tertiary: "#f97316"
typography:
  body:
    fontFamily: "Inter, sans-serif"
  display: "Fraunces, serif"
  code: "JetBrains Mono, monospace"
rounded:
  small: 4px
  medium: 8px
  large: 16px
---
`,
    });

    expect(theme).toEqual({
      "color-bg": "#f7f5f0",
      "color-surface": "#ffffff",
      "color-fg": "#171717",
      "color-fg-muted": "#737373",
      "color-primary": "#171717",
      "color-primary-fg": "#ffffff",
      "color-border": "#d4d4d4",
      "color-ring": "#2563eb",
      "color-danger": "#dc2626",
      "color-signal": "#f97316",
      "font-sans": "Inter, sans-serif",
      "font-serif": "Fraunces, serif",
      "font-mono": "JetBrains Mono, monospace",
      "radius-sm": "4px",
      "radius-md": "8px",
      "radius-lg": "16px",
    });
  });

  it("drops an invalid color with a warning", () => {
    const { theme, warnings } = themeFromDesign({
      designMd: `---
colors:
  background: "url(https://example.com/pixel.png)"
---
`,
    });

    expect(theme["color-bg"]).toBeUndefined();
    expect(warnings).toContain(
      '--loupe-color-bg: "url(https://example.com/pixel.png)" is not a valid color; dropped',
    );
  });

  it("warns when no design input is provided", () => {
    const { theme, warnings } = themeFromDesign({});

    expect(theme).toEqual({});
    expect(warnings).toContain("no DESIGN.md or design.json provided; theme is empty (all defaults)");
  });
});

describe("themeFromDesignDir", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores poisoned design.json and still resolves DESIGN.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "loupe-theme-"));
    dirs.push(dir);
    writeFileSync(
      join(dir, "DESIGN.md"),
      `---
colors:
  background: "#f7f5f0"
---
`,
      "utf8",
    );
    mkdirSync(join(dir, ".impeccable"), { recursive: true });
    writeFileSync(join(dir, ".impeccable", "design.json"), "{not json", "utf8");

    const { theme, warnings } = themeFromDesignDir(dir);

    expect(theme["color-bg"]).toBe("#f7f5f0");
    expect(warnings[0]).toMatch(/could not parse/);
  });
});
