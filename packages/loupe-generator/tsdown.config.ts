import { defineConfig } from "tsdown";

export default defineConfig({
  // The generator ships its own browser entry so it can esbuild-bundle the
  // mount code at generate() time; ship it alongside index.
  entry: ["src/index.ts", "src/browser-entry.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // Node-only deps and workspace siblings are external (resolved at runtime).
  external: [
    "esbuild",
    "@lucentive-labs/loupe-core",
    "@lucentive-labs/loupe-dom",
    "@lucentive-labs/loupe-schema",
  ],
});
