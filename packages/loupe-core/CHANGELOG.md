# @lucentive-labs/loupe-core

## 0.2.0

### Minor Changes

- 438adf4: Glanceable decision flows + editorial theme preset.

  - `question` (config-level default, per-group override): renders as the step's
    visual headline via the new optional `font-display` token; the group title
    demotes to a small-caps eyebrow.
  - Progressive disclosure for long context: `promptLead` (always-visible lead
    line) + `promptCollapsible` (full prompt behind a `promptSummary` toggle,
    default "Full context"); open state survives re-renders.
  - `THEME_PRESETS.editorial`: light "editor's desk" preset — paper ground, ink,
    a single editor-blue accent, serif `font-display`, system font stacks only,
    content-forward for text/decision flows.
  - Decision specimens: `detail` now preserves line breaks, so tiles can carry
    full multi-paragraph copy blocks.

### Patch Changes

- Updated dependencies [438adf4]
  - @lucentive-labs/loupe-schema@0.2.0

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

### Patch Changes

- Updated dependencies [789501d]
  - @lucentive-labs/loupe-schema@0.1.0
