/**
 * Deterministic regression guards for Loupe's two embed fixes — no pixel baselines,
 * just computed-layout assertions against the real loupe-dom styles.css. Run with:
 *
 *   pnpm check:embed        # (from examples/brand-starter)
 *
 * Guard 1 (type specimen, #7): a `type` specimen in a narrow tile must not clip —
 *   long words break and the sample scales, so nothing overflows the media box.
 * Guard 2 (layout reflow, #8): the page layout reflows on CONTAINER width, guarded
 *   to wide viewports — a narrow embed stacks the preview below the groups, while
 *   standalone artifacts and the mobile fixed bottom-sheet are unchanged.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../packages/loupe-dom/src/styles.css", import.meta.url), "utf8");
let fail = 0;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗ FAIL"}  ${m}`);
  if (!c) fail++;
};

const browser = await chromium.launch();

// ---- Guard 1: narrow-tile type specimen does not clip (#7) --------------------
{
  const SAMPLES = ["Directional System", "Lucid futures, built.", "Extraordinarilylongword"];
  const TILE = 140; // px — a crushed docs-column option tile
  const html = `<!doctype html><meta charset=utf8><style>${css}</style>
<body style="margin:0;background:#0c1a1c;display:flex;gap:10px;padding:10px">
${SAMPLES.map((s, i) => `<div style="width:${TILE}px"><span class="loupe-tile__media" style="display:block">
  <span class="loupe-type"><span class="loupe-type__kicker">DISPLAY / SANS</span><span class="loupe-type__sample" id="s${i}">${s}</span></span>
</span></div>`).join("")}`;
  const page = await (await browser.newContext({ viewport: { width: 520, height: 300 }, deviceScaleFactor: 2 })).newPage();
  await page.setContent(html, { waitUntil: "load" });
  for (let i = 0; i < SAMPLES.length; i++) {
    const m = await page.$eval(`#s${i}`, (el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
    ok(m.sw <= m.cw + 1 && m.sh <= m.ch + 1, `#7 type sample "${SAMPLES[i]}" fits a ${TILE}px tile (w:${m.sw}/${m.cw} h:${m.sh}/${m.ch})`);
  }
}

// ---- Guard 2: layout reflows on container width, guarded (#8) ------------------
{
  const skeleton = (embedW) => `<!doctype html><meta charset=utf8><style>${css}</style>
<body style="margin:0">${embedW ? `<div style="width:${embedW}px">` : ""}
  <div class="loupe"><main class="loupe-main"><section class="loupe-lab"><div class="loupe-lab__grid" id="grid">
    <div class="loupe-groups">g</div><aside class="loupe-stack" id="stack">preview</aside>
  </div></section></main></div>${embedW ? "</div>" : ""}`;
  const CASES = [
    { name: "standalone 1300vw", vw: 1300, embed: 0, cols: 2, pos: "sticky" },
    { name: "standalone 1150vw (no early reflow)", vw: 1150, embed: 0, cols: 2, pos: "sticky" },
    { name: "embed 600px @1300vw (reflows)", vw: 1300, embed: 600, cols: 1, pos: "static" },
    { name: "mobile 390vw (fixed sheet kept)", vw: 390, embed: 0, cols: 1, pos: "fixed" },
  ];
  for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: c.vw, height: 900 } });
    const page = await ctx.newPage();
    await page.setContent(skeleton(c.embed), { waitUntil: "load" });
    const m = await page.evaluate(() => {
      const g = document.getElementById("grid"), s = document.getElementById("stack");
      return { cols: getComputedStyle(g).gridTemplateColumns.trim().split(/\s+/).length, pos: getComputedStyle(s).position };
    });
    ok(m.cols === c.cols && m.pos === c.pos, `#8 ${c.name}: ${m.cols}col/${m.pos} (want ${c.cols}col/${c.pos})`);
    await ctx.close();
  }
}

await browser.close();
console.log(fail === 0 ? "\nEMBED GUARDS PASSED" : `\n${fail} GUARD(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
