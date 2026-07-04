# @lucentive-labs/loupe-schema

## 0.1.0

### Minor Changes

- 789501d: Initial public release of Loupe — the open-source, config-driven, agent-native
  decision-lock toolkit.

  - `loupe-schema`: Zod config schema, inferred types, JSON Schema export, and a
    semantic validator (the contract a human or AI agent fills).
  - `loupe-core`: zero-dependency headless core — SSR-safe store, deterministic
    composed-preview / export-brief derivations, exact crop math, theming
    (`tokensToCssVars`), and ARIA prop-getters for the radiogroup pattern.
  - `loupe-dom`: vanilla browser renderer — `mount`, `renderToString`, the crop
    engine, and shippable `styles.css`.
  - `loupe-generator`: Node-only `generate()` that bundles a self-contained,
    deterministic `index.html` (JS + CSS inlined, assets copied) for the
    screenshot-verify loop.
  - `loupe-react`: React 19 adapter — `<Loupe />` + `useLoupe()` over
    `useSyncExternalStore`, SSR/hydration-safe.
