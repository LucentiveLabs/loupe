import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // Ship the compiled stylesheet next to the JS so consumers can
  // `import "@lucentive-labs/loupe-dom/styles.css"` (no auto-injection).
  copy: [{ from: "src/styles.css", to: "dist" }],
  // Workspace siblings stay external; they are their own published packages.
  external: ["@lucentive-labs/loupe-core", "@lucentive-labs/loupe-schema"],
});
