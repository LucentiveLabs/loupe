// Publish-correctness gate for the public @lucentive-labs/loupe-* packages.
//
// Validates the REAL tarball (the one `changeset publish` / `pnpm publish` ship),
// not the dev workspace. pnpm pack applies `publishConfig` (so entry points
// resolve to ./dist/*) and rewrites `workspace:*` to concrete versions — the
// exact bytes a consumer installs.
//
//   1. publint  — exports map / files / types are internally consistent
//   2. attw     — type declarations resolve under node10/node16/bundler
//
// `cjs-resolves-to-esm` is ignored on purpose: every package is ESM-only
// (`"type": "module"`), so a CJS `require()` resolving to ESM is expected — CJS
// consumers use dynamic import.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";

const PKGS_DIR = "packages";
const out = mkdtempSync(join(tmpdir(), "loupe-publish-"));
const pkgs = readdirSync(PKGS_DIR).filter((p) => p.startsWith("loupe-"));

let failed = false;
for (const p of pkgs) {
  const dir = join(PKGS_DIR, p);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const { name, version } = pkg;
  const tgz = join(out, `${name.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`);

  // Non-JS export subpaths (e.g. "./styles.css") aren't type-resolvable —
  // exclude them from attw so they don't read as a NoResolution failure.
  const exp = pkg.publishConfig?.exports ?? pkg.exports ?? {};
  const cssEntrypoints = Object.entries(exp)
    .filter(([, v]) => {
      const target = typeof v === "string" ? v : v?.import ?? v?.default ?? v?.types;
      return typeof target === "string" && target.endsWith(".css");
    })
    .map(([k]) => k);

  console.log(`\n=== ${name} ===`);
  try {
    execFileSync("pnpm", ["--filter", name, "exec", "publint"], { stdio: "inherit" });
    execFileSync("pnpm", ["pack", "--pack-destination", out], { cwd: dir, stdio: "ignore" });
    const attwArgs = ["exec", "attw", tgz, "--ignore-rules", "cjs-resolves-to-esm"];
    if (cssEntrypoints.length) attwArgs.push("--exclude-entrypoints", ...cssEntrypoints);
    execFileSync("pnpm", attwArgs, { stdio: "inherit" });
  } catch {
    failed = true;
    console.error(`✗ ${name} failed publish checks`);
  }
}

if (failed) {
  console.error("\nPublish checks FAILED.");
  process.exit(1);
}
console.log("\nAll packages pass publish checks.");
