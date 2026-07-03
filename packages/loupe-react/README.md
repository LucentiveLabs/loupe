# @lucentive-labs/loupe-react

The **Loupe** React 19 adapter: a `<Loupe />` component and a `useLoupe()` hook,
both a thin `useSyncExternalStore` view over
[`@lucentive-labs/loupe-core`](../loupe-core). SSR/hydration-safe. Declares
`react` / `react-dom` `>=19` as peer dependencies.

## Install

> Publishing to npm shortly. Until then, use Loupe from a clone of the workspace: <https://github.com/LucentiveLabs/loupe>

```sh
pnpm add @lucentive-labs/loupe-react @lucentive-labs/loupe-dom
```

## Usage

```tsx
import { Loupe } from "@lucentive-labs/loupe-react";
import "@lucentive-labs/loupe-dom/styles.css"; // import once, app-wide
import { config } from "./loupe.config";

export function DecisionLock() {
  return <Loupe config={config} />;
}
```

For headless control, `useLoupe(config)` returns the selections, the composed
preview, and the export brief.

## Sibling packages

- [`@lucentive-labs/loupe-schema`](../loupe-schema) — the Zod config contract + JSON Schema.
- [`@lucentive-labs/loupe-core`](../loupe-core) — zero-dependency headless core (store, derivations, crop math).
- [`@lucentive-labs/loupe-dom`](../loupe-dom) — vanilla browser renderer + `styles.css`.
- [`@lucentive-labs/loupe-generator`](../loupe-generator) — Node-only self-contained artifact builder.

---

Part of **Loupe** — full catalog & docs at https://labs.lucentive.io/libraries/loupe · source: github.com/LucentiveLabs/loupe

[MIT](../../LICENSE) © 2026 Lucentive Labs.
