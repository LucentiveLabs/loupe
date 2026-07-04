/**
 * Visual regression for the Loupe artifact renderer.
 *
 * Renders the brand-starter flow in the shipped theme states (default = Night
 * Atlas, neutral preset, a project theme) at desktop + mobile, screenshots the
 * canonical steps (a decision step + the review/hand-off step), and pixel-diffs
 * each against a committed baseline in ./visual/baseline/.
 *
 *   pnpm exec tsx examples/brand-starter/visual-regression.mjs      # diff vs baseline
 *   UPDATE_BASELINES=1 pnpm exec tsx examples/brand-starter/visual-regression.mjs
 *
 * First run (no baseline) establishes baselines and exits 0. Exits 1 on drift so
 * it can gate CI.
 */
import { chromium } from "@playwright/test";
import { generate } from "@lucentive-labs/loupe-generator";
import { NEUTRAL_TOKENS } from "@lucentive-labs/loupe-core";
import { config } from "./loupe.config.ts";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "visual");
const ART = path.join(ROOT, "artifacts");
const BASE = path.join(ROOT, "baseline");
const CUR = path.join(ROOT, "current");
const DIFF = path.join(ROOT, "diff");
for (const d of [ART, BASE, CUR, DIFF]) fs.mkdirSync(d, { recursive: true });

const UPDATE = process.env.UPDATE_BASELINES === "1";
const PX_THRESHOLD = 0.1;
const MAX_DIFF_RATIO = 0.006;

const STATES = [
  ["default", { ...config, theme: undefined }], // → DEFAULT_TOKENS (Night Atlas)
  ["neutral", { ...config, theme: NEUTRAL_TOKENS }],
  ["project", config], // brand-starter's own theme
];
const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

for (const [name, cfg] of STATES) {
  await generate(
    { ...cfg, layout: "flow" },
    { outDir: path.join(ART, name), assetsDir: here, storageKey: `vr-${name}` },
  );
}

const results = [];
const capture = async (page, key) => {
  const curPath = path.join(CUR, `${key}.png`);
  await page.screenshot({ path: curPath });
  const basePath = path.join(BASE, `${key}.png`);
  const existed = fs.existsSync(basePath);
  if (UPDATE || !existed) {
    fs.copyFileSync(curPath, basePath);
    results.push({ key, status: UPDATE && existed ? "updated" : "new" });
    return;
  }
  const cur = PNG.sync.read(fs.readFileSync(curPath));
  const base = PNG.sync.read(fs.readFileSync(basePath));
  if (cur.width !== base.width || cur.height !== base.height) {
    results.push({ key, status: "size-changed", detail: `${base.width}x${base.height} -> ${cur.width}x${cur.height}` });
    return;
  }
  const diff = new PNG({ width: cur.width, height: cur.height });
  const bad = pixelmatch(base.data, cur.data, diff.data, cur.width, cur.height, { threshold: PX_THRESHOLD });
  const ratio = bad / (cur.width * cur.height);
  if (ratio > MAX_DIFF_RATIO) {
    fs.writeFileSync(path.join(DIFF, `${key}.png`), PNG.sync.write(diff));
    results.push({ key, status: "CHANGED", ratio: ratio.toFixed(4) });
  } else {
    results.push({ key, status: "ok", ratio: ratio.toFixed(4) });
  }
};

const b = await chromium.launch();
for (const [state] of STATES) {
  for (const [vpName, vp] of VIEWPORTS) {
    const p = await b.newPage({ viewport: vp });
    await p.goto("file://" + path.join(ART, state, "index.html"));
    await p.waitForTimeout(500);
    await capture(p, `${state}__${vpName}__group`);
    const rail = p.locator("[data-loupe-rail-step]");
    const n = await rail.count();
    if (n) await rail.nth(n - 1).click();
    await p.waitForTimeout(500);
    await capture(p, `${state}__${vpName}__review`);
    await p.close();
  }
}
await b.close();

const changed = results.filter((r) => r.status === "CHANGED" || r.status === "size-changed");
const fresh = results.filter((r) => r.status === "new" || r.status === "updated");
for (const r of results) console.log(`  ${r.status.padEnd(13)} ${r.key}${r.ratio ? ` (${r.ratio})` : ""}${r.detail ? ` ${r.detail}` : ""}`);
console.log(`\n${results.length} shots - ${fresh.length} new/updated - ${changed.length} changed`);
if (changed.length) {
  console.log("DRIFT - see visual/diff/. Review, then re-run with UPDATE_BASELINES=1 if intended.");
  process.exitCode = 1;
}
