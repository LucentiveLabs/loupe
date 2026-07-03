/**
 * Theme-resolution gate (Loupe v2) — a project's DESIGN.md (+ design.json) maps
 * to a Loupe theme and actually applies to the artifact. Asserts the role map
 * (structural vs accent), font/radius mapping, the design.json-only path, and
 * that the resolved theme lands at :root end to end.
 *
 * Run: pnpm exec tsx verify-design-theme.mjs
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate, themeFromDesign } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, "dist", "_designtheme");
const results = [];
const ok = (n, c, d = "") => {
  results.push({ n, pass: !!c });
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const DESIGN_MD = `---
colors:
  primary: "#13ece1"
  ink: "#0f172a"
  ink-secondary: "#475569"
  mist: "#eef2f3"
  surface: "#ffffff"
  border: "#dbe0e2"
  danger: "#e0564f"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(1.7rem, 3.4vw, 2.4rem)"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
rounded:
  sm: "8px"
  md: "12px"
  card: "26px"
---
# Overview
Prose that should be ignored by the parser.
`;

const DESIGN_JSON = {
  schemaVersion: 2,
  extensions: { colorMeta: { primary: { role: "primary", canonical: "#13ece1" }, gold: { canonical: "#d9ae12" } } },
};

async function main() {
  const { theme } = themeFromDesign({ designMd: DESIGN_MD, designJson: DESIGN_JSON });

  ok("signal <- DESIGN.primary (accent)", theme["color-signal"] === "#13ece1", theme["color-signal"]);
  ok("fg <- ink", theme["color-fg"] === "#0f172a", theme["color-fg"]);
  ok("primary is structural (ink), not the accent", theme["color-primary"] === "#0f172a", theme["color-primary"]);
  ok("bg <- mist", theme["color-bg"] === "#eef2f3", theme["color-bg"]);
  ok("surface <- surface", theme["color-surface"] === "#ffffff");
  ok("fg-muted <- ink-secondary", theme["color-fg-muted"] === "#475569");
  ok("border <- border", theme["color-border"] === "#dbe0e2");
  ok("danger <- danger", theme["color-danger"] === "#e0564f");
  ok("font-sans <- body.fontFamily", theme["font-sans"] === "Manrope, system-ui, sans-serif", theme["font-sans"]);
  ok("font-serif <- display.fontFamily", theme["font-serif"] === "Fraunces, Georgia, serif", theme["font-serif"]);
  ok("radius-sm <- rounded.sm", theme["radius-sm"] === "8px");
  ok("radius-md <- rounded.md", theme["radius-md"] === "12px");
  ok("radius-lg <- rounded.card", theme["radius-lg"] === "26px", theme["radius-lg"]);

  // Applies end to end: generate with the resolved theme, read :root.
  const gen = await generate(config, { outDir: path.join(tmp, "a"), assetsDir: here, theme });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(pathToFileURL(gen.htmlPath).href, { waitUntil: "load", timeout: 30000 });
    const readVar = (v) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
    ok("resolved bg applies at :root", (await readVar("--loupe-color-bg")) === "#eef2f3");
    ok("resolved accent applies at :root", (await readVar("--loupe-color-signal")) === "#13ece1");
    ok("no page errors with resolved theme", errs.length === 0, errs.join(" | "));
  } finally {
    await browser.close();
  }

  // design.json-only path (no DESIGN.md) resolves colors from colorMeta canonical.
  const jsonOnly = themeFromDesign({ designJson: DESIGN_JSON });
  ok("design.json-only maps signal from colorMeta", jsonOnly.theme["color-signal"] === "#13ece1", jsonOnly.theme["color-signal"]);

  // empty input warns clearly.
  const empty = themeFromDesign({});
  ok("empty input warns", empty.warnings.some((w) => /no DESIGN\.md or design\.json/i.test(w)));

  fs.rmSync(tmp, { recursive: true, force: true });
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} design-theme assertions passed.`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.n}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
