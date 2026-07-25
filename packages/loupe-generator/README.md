# @lucentive-labs/loupe-generator

The Node-only **Loupe** static-HTML generator. `generate()` bundles a
self-contained, deterministic `index.html` (JS + CSS inlined, referenced assets
copied and URL-rewritten) that runs under `file://` or any static host — the
artifact at the heart of the screenshot-verify loop. No timestamps or absolute
paths, so output is reproducible.

## Install

```sh
pnpm add @lucentive-labs/loupe-generator
```

## Usage

```ts
import { generate } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config";

await generate(config, { outDir: "dist", assetsDir: import.meta.dirname });
// → dist/index.html (+ dist/assets/* if the config references any)
```

`generate()` validates the config before emitting. Verify the artifact with a
Playwright screenshot, then export the brief.

## Sibling packages

- [`@lucentive-labs/loupe-schema`](../loupe-schema) — the Zod config contract + JSON Schema.
- [`@lucentive-labs/loupe-core`](../loupe-core) — framework-free headless core (store, derivations, crop math).
- [`@lucentive-labs/loupe-dom`](../loupe-dom) — vanilla browser renderer + `styles.css`.
- [`@lucentive-labs/loupe-react`](../loupe-react) — React 19 adapter (`<Loupe />`, `useLoupe()`).

---

Part of **Loupe** — full catalog & docs at https://labs.lucentive.io/libraries/loupe · source: github.com/LucentiveLabs/loupe

[MIT](../../LICENSE) © 2026 Lucentive Labs.
