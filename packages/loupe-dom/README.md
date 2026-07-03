# @lucentive-labs/loupe-dom

The canonical **Loupe** browser renderer with zero framework dependencies:
`mount()` for live interactive use, `renderToString()` for SSR, the crop engine,
`applyTheme()`, and a shippable `styles.css`. Built on
[`@lucentive-labs/loupe-core`](../loupe-core).

## Install

> Publishing to npm shortly. Until then, use Loupe from a clone of the workspace: <https://github.com/LucentiveLabs/loupe>

```sh
pnpm add @lucentive-labs/loupe-dom
```

## Usage

```ts
import { mount } from "@lucentive-labs/loupe-dom";
import "@lucentive-labs/loupe-dom/styles.css"; // import once
import { config } from "./loupe.config";

const instance = mount(document.getElementById("app")!, { config });
// instance.destroy() to tear down
```

Server-side, `renderToString(config, selections)` returns markup you can hydrate.

## Sibling packages

- [`@lucentive-labs/loupe-schema`](../loupe-schema) — the Zod config contract + JSON Schema.
- [`@lucentive-labs/loupe-core`](../loupe-core) — zero-dependency headless core (store, derivations, crop math).
- [`@lucentive-labs/loupe-react`](../loupe-react) — React 19 adapter (`<Loupe />`, `useLoupe()`).
- [`@lucentive-labs/loupe-generator`](../loupe-generator) — Node-only self-contained artifact builder.

---

Part of **Loupe** — full catalog & docs at https://labs.lucentive.io/libraries/loupe · source: github.com/LucentiveLabs/loupe

[MIT](../../LICENSE) © 2026 Lucentive Labs.
