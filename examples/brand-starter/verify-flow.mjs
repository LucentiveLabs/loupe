/**
 * Flow-layout acceptance gate (Loupe v2, Workstream A — guided stepper).
 *
 * The default "flow" layout presents one decision per screen with a rail,
 * Back/Next, and a final Review/hand-off step. Asserts:
 *   - the flow scaffolding renders and starts on step 0
 *   - exactly one step is active; later steps are hidden (one question at a time)
 *   - the active step shows only its own group's tiles
 *   - Next advances, Back returns, and the rail jumps to an arbitrary step
 *   - the Review step composes the preview + export brief
 *   - no horizontal overflow at mobile (360) or desktop (1440) — mobile-first
 * Captures desktop + mobile screenshots.
 *
 * Run: pnpm exec tsx verify-flow.mjs   (exit non-zero on any failure)
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "dist", "_flow");
const shotDir = path.join(here, "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const reviewIndex = config.groups.length;
const firstGroupOptions = config.groups[0].options.length;

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function main() {
  // flow is the default layout (no `layout` set).
  const gen = await generate(config, { outDir, assetsDir: here });
  ok("generate() wrote index.html", fs.existsSync(gen.htmlPath));
  const url = pathToFileURL(gen.htmlPath).href;

  const browser = await chromium.launch();
  const errors = [];
  const attach = (p) => {
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    p.on("pageerror", (e) => errors.push(e.message));
  };

  // ---------------- Desktop ----------------
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  attach(page);
  await page.goto(url, { waitUntil: "load", timeout: 30000 });

  const flow = page.locator("[data-loupe-flow]");
  ok("flow scaffolding renders", (await flow.count()) === 1);
  ok("starts on step 0", (await flow.getAttribute("data-step")) === "0");
  ok("exactly one active step", (await page.locator(".loupe-step.is-active").count()) === 1);
  ok(
    "active step shows only its group's tiles",
    (await page.locator('.loupe-step.is-active [data-loupe-part="tile"]').count()) === firstGroupOptions,
    `${firstGroupOptions} expected`,
  );
  ok("a later step is hidden", !(await page.locator('[data-loupe-step="1"]').isVisible()));

  await page.locator('[data-loupe-nav="next"]').click();
  ok("Next advances to step 1", (await flow.getAttribute("data-step")) === "1");
  await page.locator('[data-loupe-nav="back"]').click();
  ok("Back returns to step 0", (await flow.getAttribute("data-step")) === "0");
  await page.locator('[data-loupe-rail-step="2"]').click();
  ok("rail jumps to step 2", (await flow.getAttribute("data-step")) === "2");

  // desktop screenshot of a mid-flow question
  await page.screenshot({ path: path.join(shotDir, "flow-desktop.png"), fullPage: true });

  // jump to Review and confirm it composes preview + brief
  await page.locator(`[data-loupe-rail-step="${reviewIndex}"]`).click();
  ok("Review step is active", await page.locator(".loupe-step--review.is-active").isVisible());
  ok("Review composes the preview", (await page.locator("[data-loupe-preview]").count()) >= 1);
  const briefVal = await page.locator("[data-loupe-brief]").inputValue();
  ok("Review shows a non-empty export brief", briefVal.trim().length > 0);
  ok("no horizontal overflow (desktop)", (await overflow(page)) <= 1, `${await overflow(page)}px`);
  await ctx.close();

  // ---------------- Mobile ----------------
  const mctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const mpage = await mctx.newPage();
  attach(mpage);
  await mpage.goto(url, { waitUntil: "load", timeout: 30000 });
  ok("mobile: one question fills the screen", (await mpage.locator(".loupe-step.is-active").count()) === 1);
  ok("no horizontal overflow (mobile 360)", (await overflow(mpage)) <= 1, `${await overflow(mpage)}px`);
  await mpage.locator('[data-loupe-nav="next"]').click();
  ok("mobile Next advances", (await mpage.locator("[data-loupe-flow]").getAttribute("data-step")) === "1");
  await mpage.screenshot({ path: path.join(shotDir, "flow-mobile.png"), fullPage: true });
  await mctx.close();

  await browser.close();
  ok("no console/page errors", errors.length === 0, errors.slice(0, 6).join(" | "));

  fs.rmSync(outDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} flow assertions passed.`);
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
