import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // The schema is a separate workspace package (type-only import here); never
  // inline it. loupe-core itself has zero runtime dependencies.
  external: ["@lucentive-labs/loupe-schema"],
});
