<div align="center">

<img src="./assets/loupe-mark.svg" alt="Loupe" width="76" height="76" />

# Loupe

**Lock a decision by clicking it, not describing it.**

Open-source · config-driven · agent-native decision-lock — for visual choices and strategic calls alike.

[Live demo](https://labs.lucentive.io/libraries/loupe) ·
[Docs](https://labs.lucentive.io/docs)

[![CI](https://github.com/LucentiveLabs/loupe/actions/workflows/ci.yml/badge.svg)](https://github.com/LucentiveLabs/loupe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>

A decision usually dies in a document. For a visual call, someone writes "warm, editorial,
not corporate," three people picture three different things, and the build pass guesses. For a
strategic call — a naming decision, an architecture trade-off, a go/no-go — the same paragraph
buries the options and the reasoning. Loupe replaces that paragraph with something you can click.

You describe the decision as a typed config. Loupe turns each choice into a real **option
tile** — a rendered image crop, a color palette, a type specimen, a motion feel, a layout mock,
or, for a strategic call, a text tile leading with the option and its trade-off flags. Locking a
tile recomposes a live preview and keeps a deterministic **export brief** in sync. That brief —
markdown and JSON — is the ground truth the next build pass consumes, whether the builder is a
person or an agent.

```
typed config  →  rendered option tiles  →  lock picks  →  deterministic export brief
```

## The name

A loupe is the small lens a jeweler or a printer holds to a stone or a proof — you bring the
real thing right up to your eye and examine it closely before you commit. That is the whole
idea: don't describe the decision, look at it. Loupe puts each option under the lens — the actual
crop, the actual type, the actual trade-off — and locks the one you choose.

## Why Loupe

- **Seen or stated, never guessed.** Visual options render the actual thing — a real crop of a
  real board, a real type family at a real weight. Strategic options state the call and its
  trade-off `flags`, with one recommended pick; decisions already made ride along as read-only
  `locked` groups, so the full picture stays in view without being re-litigated.
- **The contract, not a screenshot of one.** The export brief derives from the same
  selections that drive the preview, so they can never drift. Hand the brief to a build
  pass and it is exact.
- **Agent-native.** The config is a Zod schema; `toJsonSchema()` emits the exact contract
  an agent fills. An agent can author a decision-lock, screenshot-verify it, and export the
  brief without a human writing TypeScript.
- **Portable.** The generator produces one self-contained `index.html` — JS and CSS inlined,
  assets copied beside it — that runs under `file://` or any static host with zero runtime
  dependency on these packages.

## Packages

Loupe is a small set of layers. The headless core holds all the logic; everything above it
is a thin renderer. Take only the layer you need — they all read the same config.

| Package | What it is |
| --- | --- |
| [`@lucentive-labs/loupe-schema`](./packages/loupe-schema) | The Zod config contract + JSON Schema emitter + semantic validator. |
| [`@lucentive-labs/loupe-core`](./packages/loupe-core) | Zero-dependency headless core — SSR-safe store, deterministic derivations, crop math, ARIA prop-getters. |
| [`@lucentive-labs/loupe-dom`](./packages/loupe-dom) | The canonical vanilla browser renderer — `mount()`, `renderToString()`, and `styles.css`. |
| [`@lucentive-labs/loupe-react`](./packages/loupe-react) | The React 19 adapter — `<Loupe />` and `useLoupe()`. |
| [`@lucentive-labs/loupe-generator`](./packages/loupe-generator) | Node-only `generate()` — bundles a self-contained, deterministic `index.html`. |

## Install & use

> **Publishing status:** the `@lucentive-labs/loupe-*` packages are being published to npm
> shortly. Until then, clone this repo and run the generator from the workspace — the
> portable-artifact path below works today with no publish.

There are two ways to consume Loupe. **Default to the portable artifact.**

**1. Portable artifact (no published packages).** From a clone of this workspace, author a
`loupe.config.ts`, run the generator, and take the self-contained `index.html`. Drop it in a
PR, a bucket, or a teammate's machine.

```ts
// generate.ts — Node, build-time
import { generate } from "@lucentive-labs/loupe-generator";
import { config } from "./loupe.config";

const { htmlPath } = await generate(config, { outDir: "out/decision-lock" });
console.log(`Artifact: ${htmlPath}`);
```

**2. Live React component** *(once the packages are published)*. When a shipping app needs
the picker live in its own UI, mount the React adapter and import the styles once.

```sh
pnpm add @lucentive-labs/loupe-react @lucentive-labs/loupe-dom @lucentive-labs/loupe-schema
```

```tsx
// app/decision/page.tsx
"use client";
import { Loupe } from "@lucentive-labs/loupe-react";
import "@lucentive-labs/loupe-dom/styles.css"; // import once, app-wide
import { config } from "./loupe.config";

export default function Page() {
  return <Loupe config={config} />;
}
```

### The agent path

Hand a model the JSON Schema, parse what it returns, and run the semantic validator before
render — no human writes TypeScript:

```ts
import { toJsonSchema, parseConfig, validateConfig } from "@lucentive-labs/loupe-schema";

const schema = toJsonSchema();        // the authoring contract for the model
const config = parseConfig(modelOut); // enforces structure
const problems = validateConfig(config); // missing assets, dup ids, broken refs
if (problems.length) throw new Error(problems.join("\n"));
```

## Examples

- [`examples/brand-starter`](./examples/brand-starter) — the lightest, asset-free starter:
  palette, type, layout, and motion decisions with a swapped brand theme. Copy it as the
  template for a new decision-lock.

## Develop

This is a [pnpm](https://pnpm.io) workspace.

```sh
pnpm install
pnpm -r build      # build every package
pnpm -r test       # run unit + conformance tests
pnpm -r typecheck  # type-check every package
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution flow and
[`skills/loupe/SKILL.md`](./skills/loupe/SKILL.md) for the end-to-end authoring method.

## About

Loupe is built and maintained by [Lucentive Labs](https://labs.lucentive.io) — the
open-source workbench from Lucentive. Each library here runs inside a Lucentive product
before it ships to you.

[MIT](./LICENSE) © 2026 Lucentive Labs.
