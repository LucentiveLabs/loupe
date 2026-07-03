import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // Zod is a runtime dependency, not bundled into the published package.
  external: ["zod"],
});
