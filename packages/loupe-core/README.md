# @lucentive-labs/loupe-core

The **Loupe** headless core — zero runtime dependencies. An SSR-safe selection
store, deterministic composed-preview and export-brief derivations, exact crop
math, theming (`tokensToCssVars`), and ARIA prop-getters. Every Loupe renderer
(`loupe-dom`, `loupe-react`) is a thin view over this.

## Install

> Publishing to npm shortly. Until then, use Loupe from a clone of the workspace: <https://github.com/LucentiveLabs/loupe>

```sh
pnpm add @lucentive-labs/loupe-core
```

## Usage

```ts
import { createLoupeStore, selectComposedPreview, selectExportBrief } from "@lucentive-labs/loupe-core";
import type { Config } from "@lucentive-labs/loupe-schema";

const store = createLoupeStore(config);
store.toggle("palette", "signal-cyan");      // lock a tile

const preview = selectComposedPreview(config, store.getSelections());
const brief = selectExportBrief(config, store.getSelections()); // deterministic ground truth
```

The preview and the export brief are both derived from the same selections, so
they never drift.

## Sibling packages

- [`@lucentive-labs/loupe-schema`](../loupe-schema) — the Zod config contract + JSON Schema.
- [`@lucentive-labs/loupe-dom`](../loupe-dom) — vanilla browser renderer + `styles.css`.
- [`@lucentive-labs/loupe-react`](../loupe-react) — React 19 adapter (`<Loupe />`, `useLoupe()`).
- [`@lucentive-labs/loupe-generator`](../loupe-generator) — Node-only self-contained artifact builder.

---

Part of **Loupe** — full catalog & docs at https://labs.lucentive.io/libraries/loupe · source: github.com/LucentiveLabs/loupe

[MIT](../../LICENSE) © 2026 Lucentive Labs.
