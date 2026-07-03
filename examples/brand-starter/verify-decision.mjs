/**
 * Decision-lock acceptance gate (Loupe: strategic `decision` specimens + `locked` groups).
 *
 * Proves the non-visual decision-menu path: a `decision` specimen renders its
 * summary + flag chips; an OPEN decision group is interactive (locks like a
 * visual group); a `locked` group is read-only (tiles disabled/aria-disabled,
 * the store refuses changes even on a forced click); and the export brief
 * carries a `[LOCKED]` row, flag chips, and a "(differs from recommendation)"
 * marker.
 *
 * Run: pnpm exec tsx verify-decision.mjs   (exit non-zero on any failure)
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate } from "@lucentive-labs/loupe-generator";

const config = {
  version: 1,
  title: "Restructure decisions",
  layout: "page", // page layout so every group is visible at once for assertions
  groups: [
    {
      id: "raise",
      title: "Raise scope",
      prompt: "How big should the round be?",
      options: [
        {
          id: "small",
          label: "Small round",
          recommended: true,
          specimen: { kind: "decision", summary: "Raise a small round.", detail: "Less dilution now.", flags: ["reversible"] },
        },
        {
          id: "big",
          label: "Big round",
          specimen: { kind: "decision", summary: "Raise a big round.", detail: "More runway, more dilution.", flags: ["COUNSEL", "one-way door"] },
        },
      ],
    },
    {
      id: "entity",
      title: "Entity (already decided)",
      locked: true,
      options: [
        { id: "delaware", label: "Delaware C-corp", recommended: true, specimen: { kind: "decision", summary: "Delaware C-corp." } },
        { id: "uk", label: "UK Ltd", specimen: { kind: "decision", summary: "UK Ltd." } },
      ],
    },
  ],
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "dist", "_decision");
const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const gen = await generate(config, { outDir, assetsDir: here });
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(pathToFileURL(gen.htmlPath).href, { waitUntil: "load", timeout: 30000 });

    // decision specimen renders summary + flag chips
    ok("decision summary renders", (await page.locator(".loupe-decision__summary").filter({ hasText: "Raise a small round." }).count()) === 1);
    ok("decision flag chips render", (await page.locator(".loupe-decision__flag").count()) >= 1);

    // locked group is read-only: locked class, lock badge, disabled tiles
    ok("locked group has --locked class", (await page.locator('[data-loupe-group-section="entity"].loupe-group--locked').count()) === 1);
    ok("locked group shows a lock badge", (await page.locator('[data-loupe-group-section="entity"] .loupe-group__lock').count()) === 1);
    const lockedTile = page.locator('[data-loupe-part="tile"][data-group="entity"][data-option="uk"]');
    ok("locked tiles are aria-disabled", (await lockedTile.getAttribute("aria-disabled")) === "true");

    // pinned: the recommended locked option is checked, the other is not
    const del = page.locator('[data-loupe-part="tile"][data-group="entity"][data-option="delaware"]');
    ok("locked group pinned to recommended", (await del.getAttribute("aria-checked")) === "true");

    // the store refuses changes to a locked group, even on a forced click
    await lockedTile.click({ force: true });
    ok("locked group refuses a forced click", (await del.getAttribute("aria-checked")) === "true" && (await lockedTile.getAttribute("aria-checked")) === "false");

    // OPEN decision group is interactive: switch small -> big
    const big = page.locator('[data-loupe-part="tile"][data-group="raise"][data-option="big"]');
    await big.click();
    ok("open decision group is lockable", (await big.getAttribute("aria-checked")) === "true");

    // export brief carries [LOCKED], flags, and a deviation marker
    const brief = await page.locator("[data-loupe-brief]").inputValue();
    ok("brief has a [LOCKED] row", brief.includes("[LOCKED]") && brief.includes("Delaware C-corp"));
    ok("brief carries decision flags", /\[COUNSEL, one-way door\]/.test(brief));
    ok("brief marks deviation from recommendation", brief.includes("(differs from recommendation)"));
    ok("no page/console errors", errors.length === 0, errors.slice(0, 4).join(" | "));
  } finally {
    await browser.close();
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} decision assertions passed.`);
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
