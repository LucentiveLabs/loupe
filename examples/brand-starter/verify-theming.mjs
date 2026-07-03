/**
 * Theming acceptance gate (Loupe v2, Workstream B — theming plumbing).
 *
 * Proves that a caller-supplied theme actually takes effect end to end:
 *   - generate({ theme }) merges an override theme (new GenerateOptions.theme)
 *   - the merged theme wins at :root in the rendered document (cascade fix) —
 *     i.e. the page chrome outside #loupe-app respects the theme, not the house
 *     defaults baked into styles.css
 *   - font <link> emission is derived from the font-* tokens, not hardcoded
 *     Manrope (a Google family is fetched; a pure system stack fetches nothing)
 *   - the previously-dead radius-lg token is wired (no hardcoded 18px stack)
 *   - validateThemeTokens() flags unknown/misspelled --loupe-* keys
 *
 * Run: pnpm exec tsx verify-theming.mjs   (exit non-zero on any failure)
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate } from "@lucentive-labs/loupe-generator";
import { validateThemeTokens } from "@lucentive-labs/loupe-core";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, "dist", "_theming");

const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  // --- 1) Override theme applies at :root (theme param + cascade fix) ---
  const genA = await generate(config, {
    outDir: path.join(tmp, "a"),
    assetsDir: here,
    theme: { "color-bg": "rgb(1, 2, 3)", "font-sans": "Inter, system-ui, sans-serif" },
  });
  const htmlA = genA.html;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(genA.htmlPath).href, { waitUntil: "load", timeout: 30000 });

  const rootBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--loupe-color-bg").trim(),
  );
  ok(
    "override theme wins at :root (theme param + cascade fix)",
    rootBg === "rgb(1, 2, 3)",
    `--loupe-color-bg=${rootBg || "(empty)"}`,
  );
  ok("no console/page errors on themed artifact", errors.length === 0, errors.slice(0, 4).join(" | "));
  await browser.close();

  // --- 2) Font emission is token-driven ---
  ok(
    "google font link derives from font-sans (Inter)",
    /fonts\.googleapis\.com\/css2[^"']*family=Inter/i.test(htmlA),
    "expected an Inter stylesheet link",
  );
  ok(
    "themed artifact does not hardcode Manrope when font-sans overridden",
    !/family=Manrope/i.test(htmlA),
    "Manrope should not be fetched when font-sans is Inter",
  );

  const genSys = await generate(config, {
    outDir: path.join(tmp, "sys"),
    assetsDir: here,
    theme: { "font-sans": "system-ui, sans-serif", "font-serif": "Georgia, serif", "font-mono": "ui-monospace, monospace" },
  });
  ok(
    "pure system font stack fetches no web font",
    !/fonts\.googleapis\.com/i.test(genSys.html),
    "no Google Fonts link expected for a system-only stack",
  );

  // per-family isolation: two web families must be TWO links, not one combined
  // request (a combined css2 request 400s entirely if any one family/weight is missing)
  const genMulti = await generate(config, {
    outDir: path.join(tmp, "multi"),
    assetsDir: here,
    theme: { "font-sans": "Inter, system-ui", "font-serif": "Fraunces, serif" },
  });
  const cssLinks = (genMulti.html.match(/fonts\.googleapis\.com\/css2\?family=/g) || []).length;
  ok("one Google Fonts link per family (isolation)", cssLinks === 2, `${cssLinks} css2 links (expect 2)`);
  ok(
    "families are not combined into one request",
    !/family=[^"&]+&family=/.test(genMulti.html),
    "found a combined &family= request",
  );

  // --- favicon: every artifact ships one by default; overridable + disableable ---
  ok(
    "default favicon link present",
    /<link rel="icon" href="data:image\/svg\+xml/.test(htmlA),
    "expected an inlined default Loupe favicon",
  );
  const genNoFav = await generate(config, { outDir: path.join(tmp, "nofav"), assetsDir: here, favicon: false });
  ok("favicon:false omits the icon link", !/<link rel="icon"/.test(genNoFav.html), "icon link should be absent");

  // --- 3) radius-lg is wired (no hardcoded 18px stack radius) ---
  ok(
    "no hardcoded 18px stack radius (radius-lg wired)",
    !/border-radius:\s*18px/.test(htmlA),
    "found a literal 18px radius",
  );
  ok("stack references --loupe-radius-lg", htmlA.includes("var(--loupe-radius-lg)"));

  // --- 4) validateThemeTokens flags unknown keys, passes known ones ---
  const warns = validateThemeTokens({ "colour-primary": "#000", "color-bg": "#fff" });
  ok("validateThemeTokens flags unknown key", warns.some((w) => w.includes("colour-primary")), warns.join(" | "));
  ok("validateThemeTokens passes a known key", !warns.some((w) => w.includes("color-bg")), warns.join(" | "));

  // cleanup temp artifacts (kept under dist/, which is gitignored)
  fs.rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} theming assertions passed.`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
