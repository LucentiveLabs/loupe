import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
  // React + the workspace siblings are provided by the consumer / are separate
  // packages; never bundle them into the adapter.
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "@lucentive-labs/loupe-core",
    "@lucentive-labs/loupe-schema",
  ],
});
