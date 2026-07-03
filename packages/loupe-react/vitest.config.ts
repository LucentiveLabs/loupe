import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The adapter source imports its workspace siblings by package name
 * (`@lucentive-labs/loupe-core` / `-schema`) — correct for tsc (resolved via
 * the root tsconfig `paths`) and for the published artifact. This package is
 * built without running `pnpm install`, so at test runtime those names are not
 * yet symlinked into node_modules. Alias them to the sibling sources so the
 * suite runs with zero install/link — tests still use relative imports.
 */
const pkg = (name: string, rel: string) =>
  [name, fileURLToPath(new URL(rel, import.meta.url))] as const;

export default defineConfig({
  resolve: {
    alias: Object.fromEntries([
      pkg("@lucentive-labs/loupe-core", "../loupe-core/src/index.ts"),
      pkg("@lucentive-labs/loupe-schema", "../loupe-schema/src/index.ts"),
      pkg("@lucentive-labs/loupe-dom", "../loupe-dom/src/index.ts"),
    ]),
  },
});
