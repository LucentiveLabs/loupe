/**
 * Acceptance gate for the Brand Starter Loupe example.
 *
 * Generates the asset-free self-contained artifact via loupe-generator, then
 * drives it with Playwright (Chromium) to assert:
 *   - no console / page errors and no local-asset failures
 *   - tiles render (14 = 3+3+3+3+2 across 5 radiogroups)
 *   - clicking a tile flips aria-checked on it AND off its sibling, and updates
 *     the composed preview + export brief
 *   - per-group Clear, Reset (clear all), Recommended, and keyboard nav work
 *   - the always-on write-in ("something else") renders on every open group,
 *     typing flows into the brief + composed preview + progress, Clear drops
 *     it, it persists across reload via storageKey, and nothing overflows at
 *     either viewport
 * and captures desktop (1440×900) + mobile (390×844) screenshots.
 *
 * This config carries no image assets, so there are no crop <img> elements to
 * check (the broken-image assertion therefore passes vacuously). The point of
 * this fixture is generalization + theme-swap, not photographic crops.
 *
 * Exit code is non-zero if any assertion fails. Run: tsx verify.mjs
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "dist");
const shotDir = path.join(here, "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function brokenImages(page) {
  return page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll("img")) {
      if (!img.complete || img.naturalWidth === 0) {
        out.push(img.getAttribute("src") || "(no src)");
      }
    }
    return out;
  });
}

async function settle(page) {
  await page.evaluate(async () => {
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((res) => setTimeout(res, ms))]);
    if (document.fonts && document.fonts.ready) {
      await withTimeout(document.fonts.ready, 1500);
    }
  });
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function main() {
  // 1) Generate the artifact (asset-free: 0 copied assets). This gate exercises
  //    the dense "page" layout; the guided "flow" layout has its own gate
  //    (verify-flow.mjs), so pin page here.
  const gen = await generate(config, { outDir, assetsDir: here, layout: "page" });
  ok("generate() wrote index.html", fs.existsSync(gen.htmlPath), gen.htmlPath);
  ok("generate() copied no assets", gen.assets.length === 0, `${gen.assets.length} assets`);

  const url = pathToFileURL(gen.htmlPath).href;
  const browser = await chromium.launch();

  const errors = [];
  const attach = (page) => {
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (req) => {
      const u = req.url();
      if (u.startsWith("file:")) errors.push(`requestfailed: ${u}`);
    });
  };

  // ---------------- Desktop ----------------
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  attach(page);
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await settle(page);

  const tileCount = await page.locator('[data-loupe-part="tile"]').count();
  ok("renders all option tiles", tileCount === 14, `${tileCount} tiles (expect 14 = 3+3+3+3+2)`);

  const groupCount = await page.locator('[role="radiogroup"]').count();
  ok("renders all groups as radiogroups", groupCount === 5, `${groupCount} radiogroups`);

  // Asset-free: there should be no <img> at all, so none can be broken.
  const broken = await brokenImages(page);
  ok("no broken images (initial)", broken.length === 0, broken.join(", "));

  const briefSel = "[data-loupe-brief]";
  const previewSel = "[data-loupe-preview]";
  const readBrief = () => page.locator(briefSel).inputValue();
  const readPreview = () => page.locator(previewSel).innerHTML();

  // ---- Interaction: switch the color group recommended pick ----
  {
    const briefBefore = await readBrief();
    const previewBefore = await readPreview();
    const amber = page.locator('[data-loupe-part="tile"][data-group="color"][data-option="amberInk"]');
    const sage = page.locator('[data-loupe-part="tile"][data-group="color"][data-option="sageStone"]');
    ok("color.amberInk checked initially", (await amber.getAttribute("aria-checked")) === "true");
    await sage.click();
    const sageChecked = await page
      .locator('[data-loupe-part="tile"][data-group="color"][data-option="sageStone"]')
      .getAttribute("aria-checked");
    const amberChecked = await page
      .locator('[data-loupe-part="tile"][data-group="color"][data-option="amberInk"]')
      .getAttribute("aria-checked");
    ok("click flips aria-checked on (color.sageStone)", sageChecked === "true", `sage=${sageChecked}`);
    ok("sibling aria-checked flips off (color.amberInk)", amberChecked === "false", `amber=${amberChecked}`);
    const briefAfter = await readBrief();
    const previewAfter = await readPreview();
    ok("export brief updates on lock", briefAfter !== briefBefore && briefAfter.includes("Sage & stone"));
    ok("composed preview updates on lock", previewAfter !== previewBefore);
  }

  // ---- Switch the headline (drives the preview headline) ----
  {
    const previewBefore = await readPreview();
    await page.locator('[data-loupe-part="tile"][data-group="headline"][data-option="editorialSerif"]').click();
    const checked = await page
      .locator('[data-loupe-part="tile"][data-group="headline"][data-option="editorialSerif"]')
      .getAttribute("aria-checked");
    ok("headline switch checks (editorialSerif)", checked === "true", `serif=${checked}`);
    const briefAfter = await readBrief();
    const previewAfter = await readPreview();
    ok("brief reflects headline switch", briefAfter.includes("Editorial serif"));
    ok("preview reflects headline switch", previewAfter !== previewBefore);
  }

  // ---- Per-group Clear ----
  {
    await page.locator('[data-loupe-clear="color"]').click();
    const sageChecked = await page
      .locator('[data-loupe-part="tile"][data-group="color"][data-option="sageStone"]')
      .getAttribute("aria-checked");
    ok("per-group Clear deselects", sageChecked === "false", `sage=${sageChecked}`);
  }

  // ---- Reset (clear all) ----
  {
    await page.locator("[data-loupe-reset]").first().click();
    const checked = await page.locator('[data-loupe-part="tile"][aria-checked="true"]').count();
    const progress = await page.locator("[data-loupe-progress]").first().innerText();
    ok("Reset clears all selections", checked === 0, `${checked} still checked`);
    ok("Reset sets progress to 0", progress.trim() === "0", `progress=${progress}`);
  }

  // ---- Recommended ----
  {
    await page.locator("[data-loupe-recommend]").first().click();
    const checked = await page.locator('[data-loupe-part="tile"][aria-checked="true"]').count();
    const progress = await page.locator("[data-loupe-progress]").first().innerText();
    ok("Recommended restores 5 picks", checked === 5, `${checked} checked`);
    ok("Recommended sets progress to 5", progress.trim() === "5", `progress=${progress}`);
  }

  // ---- Keyboard: ArrowRight on a focused tile moves + locks ----
  {
    const first = page.locator('[data-loupe-part="tile"][data-group="hero"][data-option="portrait"]');
    await first.focus();
    await page.keyboard.press("ArrowRight");
    const sparseChecked = await page
      .locator('[data-loupe-part="tile"][data-group="hero"][data-option="sparse"]')
      .getAttribute("aria-checked");
    ok("keyboard ArrowRight moves + locks", sparseChecked === "true", `hero.sparse=${sparseChecked}`);
    await page.locator("[data-loupe-recommend]").first().click();
  }

  // ---- Write-in ("something else"): always on for open groups ----
  {
    const wiCount = await page.locator("[data-loupe-writein]").count();
    ok("write-in input renders on every open group", wiCount === 5, `${wiCount} inputs (expect 5)`);
    const inGroup = await page.locator('[role="radiogroup"] [data-loupe-writein]').count();
    ok("write-in sits outside the radiogroup", inGroup === 0, `${inGroup} inside`);

    // Per-keystroke typing: focus/caret survive the store-driven re-renders
    // (a scrambled value would betray a caret reset).
    const headlineWi = page.locator('[data-loupe-writein="headline"]');
    const briefBefore = await readBrief();
    await headlineWi.click();
    await page.keyboard.type("With a stencil variant");
    ok(
      "typing survives re-renders (focus + caret restored)",
      (await headlineWi.inputValue()) === "With a stencil variant",
      `value=${await headlineWi.inputValue()}`,
    );
    ok("non-empty write-in marks the input filled", (await headlineWi.getAttribute("data-state")) === "filled");
    const briefAfter = await readBrief();
    ok(
      "brief appends the write-in note alongside the locked pick",
      briefAfter !== briefBefore && briefAfter.includes('Headline voice: Bold humanist sans — write-in: "With a stencil variant"'),
    );
    const progress = await page.locator("[data-loupe-progress]").first().innerText();
    ok("pick + write-in still counts the group once", progress.trim() === "5", `progress=${progress}`);

    // Arrow keys inside the input edit text — they must not drive tile nav.
    const checkedBefore = await page.locator('[data-loupe-part="tile"][aria-checked="true"]').count();
    await headlineWi.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    const checkedAfter = await page.locator('[data-loupe-part="tile"][aria-checked="true"]').count();
    ok("arrow keys in the write-in don't move tile locks", checkedBefore === checkedAfter);

    // Write-in-only: clear the color pick, then the write-in IS the decision.
    await page.locator('[data-loupe-clear="color"]').click();
    const previewBefore = await readPreview();
    const colorWi = page.locator('[data-loupe-writein="color"]');
    await colorWi.fill("Copper on porcelain");
    const brief2 = await readBrief();
    ok(
      "write-in-only becomes the group's decision in the brief",
      brief2.includes('Color system: [WRITE-IN] "Copper on porcelain"'),
    );
    const previewAfter = await readPreview();
    ok(
      "composed preview reflects the write-in decision",
      previewAfter !== previewBefore && previewAfter.includes("Copper on porcelain"),
    );
    const progress2 = await page.locator("[data-loupe-progress]").first().innerText();
    ok("write-in-only group counts as decided", progress2.trim() === "5", `progress=${progress2}`);

    // Per-group Clear drops the write-in with the pick.
    await page.locator('[data-loupe-clear="color"]').click();
    ok("Clear removes the write-in", (await colorWi.inputValue()) === "");
    const progress3 = await page.locator("[data-loupe-progress]").first().innerText();
    ok("cleared write-in no longer counts", progress3.trim() === "4", `progress=${progress3}`);

    // Keyboard tile nav still intact after write-in interactions.
    await page.locator('[data-loupe-part="tile"][data-group="hero"][data-option="portrait"]').focus();
    await page.keyboard.press("ArrowRight");
    const sparseChecked = await page
      .locator('[data-loupe-part="tile"][data-group="hero"][data-option="sparse"]')
      .getAttribute("aria-checked");
    ok("tile arrow-nav unaffected by write-ins", sparseChecked === "true", `hero.sparse=${sparseChecked}`);

    // Restore the recommended stack, keep one visible write-in for the shot.
    await page.locator("[data-loupe-recommend]").first().click();
    await headlineWi.fill("With a stencil variant");
  }

  // ---- No overflow / clipping (desktop) ----
  {
    ok("no horizontal overflow (desktop)", (await overflow(page)) <= 1, `${await overflow(page)}px`);
    let clipped = 0;
    for (const wi of await page.locator("[data-loupe-writein]").all()) {
      const box = await wi.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > 1440) clipped++;
    }
    ok("write-in inputs unclipped (desktop)", clipped === 0, `${clipped} clipped`);
  }

  // ---- Desktop screenshot ----
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  const desktopPath = path.join(shotDir, "desktop.png");
  await page.screenshot({ path: desktopPath, fullPage: true });
  ok("desktop screenshot written", fs.existsSync(desktopPath), desktopPath);
  await ctx.close();

  // ---------------- Mobile ----------------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const mpage = await mctx.newPage();
  attach(mpage);
  await mpage.goto(url, { waitUntil: "load", timeout: 30000 });
  await settle(mpage);

  // Write-ins render and fit at mobile too.
  {
    const wiCount = await mpage.locator("[data-loupe-writein]").count();
    ok("write-in inputs render on mobile", wiCount === 5, `${wiCount} inputs`);
    ok("no horizontal overflow (mobile 390)", (await overflow(mpage)) <= 1, `${await overflow(mpage)}px`);
    let clipped = 0;
    for (const wi of await mpage.locator("[data-loupe-writein]").all()) {
      const box = await wi.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > 390) clipped++;
    }
    ok("write-in inputs unclipped (mobile)", clipped === 0, `${clipped} clipped`);
  }

  const sheet = mpage.locator("[data-loupe-sheet-toggle]");
  if (await sheet.isVisible()) {
    await sheet.click();
    await mpage.waitForTimeout(450);
  }
  const mobilePath = path.join(shotDir, "mobile.png");
  await mpage.screenshot({ path: mobilePath, fullPage: true });
  ok("mobile screenshot written", fs.existsSync(mobilePath), mobilePath);
  await mctx.close();

  // ---------------- Persistence (storageKey artifact) ----------------
  // Write-ins ride the same storageKey mechanism as tile locks, inside the
  // self-contained artifact (no external deps).
  {
    const pOut = path.join(here, "dist", "_persist");
    const pGen = await generate(config, {
      outDir: pOut,
      assetsDir: here,
      layout: "page",
      storageKey: "brand-starter-verify",
    });
    const pctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const ppage = await pctx.newPage();
    attach(ppage);
    const pUrl = pathToFileURL(pGen.htmlPath).href;
    await ppage.goto(pUrl, { waitUntil: "load", timeout: 30000 });
    await ppage.locator('[data-loupe-part="tile"][data-group="color"][data-option="sageStone"]').click();
    await ppage.locator('[data-loupe-writein="headline"]').fill("Persistent stencil note");
    await ppage.reload({ waitUntil: "load" });
    ok(
      "write-in persists across reload (storageKey)",
      (await ppage.locator('[data-loupe-writein="headline"]').inputValue()) === "Persistent stencil note",
    );
    ok(
      "tile lock persists alongside it",
      (await ppage.locator('[data-loupe-part="tile"][data-group="color"][data-option="sageStone"]').getAttribute("aria-checked")) === "true",
    );
    ok(
      "reloaded brief still carries the write-in",
      (await ppage.locator("[data-loupe-brief]").inputValue()).includes('write-in: "Persistent stencil note"'),
    );
    await ppage.evaluate(() => localStorage.clear());
    await pctx.close();
    fs.rmSync(pOut, { recursive: true, force: true });
  }

  await browser.close();

  ok("no console/page/asset errors", errors.length === 0, errors.slice(0, 8).join(" | "));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);
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
