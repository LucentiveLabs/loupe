/**
 * Handoff acceptance gate (Loupe v2, Workstream C — autonomous file handoff).
 *
 * Proves the no-copy-paste loop end to end: generate an artifact, serve it with
 * serveCapture(), drive it in a real browser, click "Hand off & continue", and
 * assert the locked brief is written to disk (the signal an agent waits on).
 * Also asserts the hand-off action is HIDDEN when the artifact is opened
 * standalone (file://), where it falls back to copy-to-clipboard.
 *
 * Run: pnpm exec tsx verify-handoff.mjs   (exit non-zero on any failure)
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { generate, serveCapture } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(here, "dist", "_handoff");
const outDir = path.join(tmp, "artifact");
const loupeDir = path.join(tmp, ".loupe");
const reviewIndex = config.groups.length; // flow default: the Review step holds the brief + hand-off

const results = [];
const ok = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  fs.rmSync(tmp, { recursive: true, force: true });
  await generate(config, { outDir, assetsDir: here });

  // --- 1) capture-served: hand-off POSTs the brief, server writes it ---
  const srv = await serveCapture({ artifactDir: outDir, outDir: loupeDir, name: "handoff-test" });
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(srv.url, { waitUntil: "load", timeout: 30000 });
    await page.locator(`[data-loupe-rail-step="${reviewIndex}"]`).click(); // go to Review

    const handoff = page.locator("[data-loupe-handoff]");
    ok("hand-off action visible when capture-served", await handoff.isVisible());

    await handoff.click();
    const captured = await Promise.race([
      srv.lock,
      new Promise((_, rej) => setTimeout(() => rej(new Error("lock timeout")), 10000)),
    ]);
    ok(
      "brief files written on hand off",
      fs.existsSync(captured.jsonPath) && fs.existsSync(captured.mdPath),
      captured.jsonPath,
    );
    ok("captured markdown is non-empty", typeof captured.markdown === "string" && captured.markdown.length > 0);
    const onDisk = JSON.parse(fs.readFileSync(captured.jsonPath, "utf8"));
    ok("written brief json parses to an object", onDisk && typeof onDisk === "object");
    ok("no page/console errors during hand off", errors.length === 0, errors.slice(0, 4).join(" | "));
  } finally {
    await srv.close();
    await browser.close();
  }

  // --- 2) standalone (file://): hand-off hidden, no capture server ---
  const b2 = await chromium.launch();
  try {
    const p2 = await b2.newPage();
    await p2.goto(pathToFileURL(path.join(outDir, "index.html")).href, { waitUntil: "load", timeout: 30000 });
    await p2.locator(`[data-loupe-rail-step="${reviewIndex}"]`).click(); // go to Review
    ok("hand-off action hidden when opened standalone", !(await p2.locator("[data-loupe-handoff]").isVisible()));
    ok("Copy brief still present standalone", await p2.locator("[data-loupe-copy]").count() > 0);
  } finally {
    await b2.close();
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} handoff assertions passed.`);
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
