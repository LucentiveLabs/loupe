/**
 * Generate the Brand Starter decision-lock artifact from loupe.config.ts.
 * Usage: pnpm --filter @lucentive-labs/example-brand-starter generate
 *        (or: tsx generate.ts [outDir])
 *
 * This config is asset-free (palette / type / layoutMock / motion specimens),
 * so the artifact is a single small self-contained index.html with no copied
 * image files.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const outDir = path.resolve(process.argv[2] ?? path.join(here, "dist"));
  const result = await generate(config, { outDir, assetsDir: here });
  console.log(`Generated ${result.htmlPath}`);
  console.log(`Copied ${result.assets.length} assets (asset-free config).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
