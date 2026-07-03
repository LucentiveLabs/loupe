# @lucentive-labs/loupe-schema

The **Loupe** config contract: a [Zod](https://zod.dev) schema, inferred
TypeScript types, a JSON Schema export (`toJsonSchema()`), and a semantic
validator. This is the shape a human — or an AI agent — fills to describe a
visual-design decision.

## Install

> Publishing to npm shortly. Until then, use Loupe from a clone of the workspace: <https://github.com/LucentiveLabs/loupe>

```sh
pnpm add @lucentive-labs/loupe-schema
```

## Usage

```ts
import { type Config, parseConfig, validateConfig, toJsonSchema } from "@lucentive-labs/loupe-schema";

const config: Config = {
  version: 1,
  title: "My direction",
  groups: [/* groups → options → specimens */],
};

const parsed = parseConfig(config);     // structural parse (throws on invalid shape)
const problems = validateConfig(parsed); // semantic checks → string[] (empty = valid)
const jsonSchema = toJsonSchema();       // hand to an agent to author a config as JSON
```

`parseConfig` + `validateConfig` close the generate → validate loop (duplicate
ids, missing asset references, dangling preview bands).

## Sibling packages

- [`@lucentive-labs/loupe-core`](../loupe-core) — zero-dependency headless core (store, derivations, crop math).
- [`@lucentive-labs/loupe-dom`](../loupe-dom) — vanilla browser renderer + `styles.css`.
- [`@lucentive-labs/loupe-react`](../loupe-react) — React 19 adapter (`<Loupe />`, `useLoupe()`).
- [`@lucentive-labs/loupe-generator`](../loupe-generator) — Node-only self-contained artifact builder.

---

Part of **Loupe** — full catalog & docs at https://labs.lucentive.io/libraries/loupe · source: github.com/LucentiveLabs/loupe

[MIT](../../LICENSE) © 2026 Lucentive Labs.
