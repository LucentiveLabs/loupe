import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // Keep the companion schema package external so consumers receive the
  // published runtime dependency instead of a bundled duplicate.
  external: ["@lucentive-labs/loupe-schema"],
});
