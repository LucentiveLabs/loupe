---
name: loupe
description: Use when a design OR strategic decision needs to be locked by clicking option tiles — visual choices (image crops, palettes, type, motion, layout mocks) or text-first "decision" tiles with recommendations, plus read-only "locked" groups for calls already made — composed into a live preview and a deterministic export brief. Author a loupe.config.ts, generate a self-contained artifact, verify with Playwright, then export the brief.
---

# Loupe — decision-lock method

Loupe turns a visual-design decision into clickable option tiles: each design
choice (image crop, palette, type, motion, layout mock) is a tile; locking one
recomposes a sticky live preview and keeps a deterministic, machine-readable
**export brief** in sync. You drive it from a typed config; an artifact is
generated and verified by screenshot; the brief is the ground truth a human or
AI build pass consumes.

Use this when you would otherwise write a text-first "design decision log" — the
decision-maker should *see* each option. Worked examples:

- [`examples/brand-starter`](../../examples/brand-starter) — the lightest,
  asset-free starter: palette, type, layout, and motion decisions with a swapped
  brand theme and no image assets. Copy it as the template for a new lock. Add
  `imageCrop` specimens (with intrinsic dimensions, see below) when a decision is
  driven by real boards rather than tokens.

## Strategic decision flows (not only visual)

Loupe is not only for visual choices. The `decision` specimen
(`{ kind: "decision", summary, detail?, flags? }`) turns any decision menu —
strategy calls, naming, go/no-go gates, dependency picks — into the same
clickable flow: each option is a text tile leading with its `summary`, `flags`
are short badge chips, and one `recommended: true` option per group seeds the
pick. Mark a group `locked: true` to render a decision already made as read-only
(pinned to its recommended option, tiles inert) so it stays in view without
being re-litigated; open groups still need 2–6 options. The export brief
prefixes locked rows with `[LOCKED]`, lists each decision's `flags`, and marks
`(differs from recommendation)` when a pick deviates.

Packages used: `@lucentive-labs/loupe-schema` (config + validation + JSON
Schema), `@lucentive-labs/loupe-generator` (`generate()`), and Playwright for
verification. The renderer lives in `@lucentive-labs/loupe-dom`; the React
adapter is `@lucentive-labs/loupe-react`.

## Using Loupe from ANY repo (no publish required)

**The packages do not need to be published to use Loupe for any project.** The
primary path is the **portable artifact**: author a `loupe.config.ts` that points
at the target project's assets, run the generator *from this monorepo* (the
workspace already wires the packages), and you get a self-contained, portable
`index.html` decision-lock that runs under `file://` or any static host — with no
runtime dependency on these packages.

```sh
# from this monorepo, with a config beside the examples:
pnpm -C examples/<your-surface> tsx generate.ts   # → dist/index.html (portable)
```

This skill drives that flow end to end (explore → author → generate → verify →
export brief). Only embedding the **live React component** inside another app's
build needs the packages on a registry, and that is pending a registry decision.

The portable artifact needs no registry at all. Install the published packages
(`@lucentive-labs/loupe-*`) only when you want the live React component inside a
shipping app — see <https://labs.lucentive.io/docs> for the install path.

## Method

### 1. Explore the source assets

Decide what is being chosen and gather the raw material.

- **Image assets:** record each asset's intrinsic pixel dimensions — the crop
  engine needs them. Get them with: `node -e "const{imageSize}=require('image-size');console.log(imageSize(require('fs').readFileSync(process.argv[1])))" path/to/board.png` (or any image tool / your editor's info panel). Put files under the example's `assets/`.
- **Candidate crop cells:** open each board and find clean rectangles for each
  option. Think in a decile grid: each crop is a normalized rect
  `{ x, y, w, h }` where all four are fractions `0..1` of the *intrinsic* image
  (top-left origin). Example: the left third, top two-thirds = `{ x: 0, y: 0, w: 0.31, h: 0.66 }`.
- **Brand tokens:** collect the brand's colors, radii, and fonts. They map onto
  the semantic `--loupe-*` contract as kebab keys **without** the prefix
  (e.g. `color-primary`, `radius-md`, `font-sans`). See the brand-starter
  `theme` block for a real mapping.

### 2. Author `loupe.config.ts`

Create `loupe.config.ts` exporting a `Config`. Copy the structure from
`examples/brand-starter/loupe.config.ts`. Shape:

- `assets`: `{ key: { src, width, height } }` — `src` is relative to the example
  root; `width`/`height` are the intrinsic pixels from step 1.
- `theme`: brand tokens (optional; defaults ship in core).
- `groups[]`: each `{ id, title, prompt?, options[] }` (2–6 options). One option
  per group may set `recommended: true` (it becomes the default pick).
- each option's `specimen` is one of:
  - `{ kind: "imageCrop", asset, crop: {x,y,w,h}, alt }`
  - `{ kind: "palette", colors: [...] }`
  - `{ kind: "type", family, weight?, sample, kicker? }`
  - `{ kind: "motion", preset: "breathe"|"pan"|"field", asset?, crop?, asset2?, crop2? }`
  - `{ kind: "layoutMock", plan: "portrait"|"threshold"|"sparse"|"chapters"|"belowfold"|"stack", asset?, crop?, asset2?, crop2? }`
  - `{ kind: "decision", summary, detail?, flags? }` — text-first tile for strategic / non-visual choices (see "Strategic decision flows" above)
- `preview.bands[]`: which group feeds each composed-preview slot, plus
  `headlineFrom` for the headline group.
- `banned[]`, `notes[]`, `workflow[]`: prose that flows into the export brief.

**Crop-rect model:** `{ x, y, w, h }`, each `0..1`, fractions of the intrinsic
image. The validator enforces `w > 0`, `h > 0`, `x + w <= 1`, `y + h <= 1`.

**Agent authoring from the schema:** the exact JSON Schema an agent fills is
`toJsonSchema()` from `@lucentive-labs/loupe-schema` (`z.toJSONSchema(Config, { io: "input" })`). Dump it with:

```sh
tsx -e "import('@lucentive-labs/loupe-schema').then(m=>console.log(JSON.stringify(m.toJsonSchema(),null,2)))"
```

**Validate the config** (structural + semantic) before generating:

```sh
tsx -e "import('@lucentive-labs/loupe-schema').then(async m=>{const {config}=await import('./loupe.config.ts');const cfg=m.parseConfig(config);const errs=m.validateConfig(cfg);if(errs.length){console.error('INVALID:\n- '+errs.join('\n- '));process.exit(1);}console.log('config valid');})"
```

`parseConfig` throws on structural errors (bad crop rects, missing fields);
`validateConfig` returns human-readable errors for duplicate ids, missing asset
references, and dangling preview bands.

### 3. Generate the self-contained artifact

Add scripts mirroring `examples/brand-starter/package.json`
(`generate`/`verify`/`typecheck` via `tsx`) and a `generate.ts` that calls
`generate(config, { outDir, assetsDir })`:

```sh
pnpm generate          # → dist/index.html + dist/assets/* (or: tsx generate.ts)
```

`generate()` validates the config, copies referenced assets next to the
artifact, inlines JS + CSS, and rewrites asset URLs so `dist/index.html` works
under `file://` and any static server. Output is deterministic.

### 4. Serve / open and VERIFY with Playwright

Write a `verify.mjs` modeled on `examples/brand-starter/verify.mjs`. It must load
the artifact and assert:

- no console / page / local-asset errors;
- **no broken crops** — every `<img>` has `naturalWidth > 0`;
- **tiles toggle** — clicking a tile flips `aria-checked` on it and off its
  sibling (`[data-loupe-part="tile"][data-group="..."][data-option="..."]`);
- **preview + brief update** — `[data-loupe-preview]` innerHTML and the
  `[data-loupe-brief]` textarea value both change on a lock;
- per-group `[data-loupe-clear="<group>"]`, `[data-loupe-reset]`,
  `[data-loupe-recommend]`, and keyboard arrow navigation behave;
- capture **desktop (1440×900)** and **mobile (390×844)** screenshots with
  `reducedMotion: "reduce"` and `colorScheme: "light"` for determinism.

Run it:

```sh
pnpm verify            # → screenshots/desktop.png + screenshots/mobile.png (or: tsx verify.mjs)
```

**Iterate the crop rects:** open the screenshots. If a crop lands on the wrong
detail or shows letterboxing, adjust that option's `{x,y,w,h}` in
`loupe.config.ts` and re-run `pnpm verify`. Repeat until every tile frames its
intended subject. (The crop math fills the tile at any aspect ratio given
correct intrinsic dims — letterboxing means the dims or the rect are wrong.)

### 5. Export the brief

The export brief is the deterministic handoff. Pull both forms from core:

```sh
tsx -e "Promise.all([import('@lucentive-labs/loupe-core'),import('@lucentive-labs/loupe-schema'),import('./loupe.config.ts')]).then(([core,schema,m])=>{const cfg=schema.parseConfig(m.config);const sel=core.recommendedSelections(cfg);const b=core.selectExportBrief(cfg,sel);console.log(b.markdown);console.log('\n---JSON---\n'+JSON.stringify(b.json,null,2));})"
```

- `markdown`: resolved direction, locked decisions, banned list, workflow.
- `json`: machine-readable locks + decisions + banned, for the build pass.

In the running artifact the **Copy brief** button copies the same markdown, and
the textarea always holds the current brief. Hand the brief to the production
pass as ground truth.

## Notes

- Keep `loupe.config.ts` as the single source of truth — preview and brief are
  derived from the same selections, so they never drift.
- `motion` presets are a fixed safe enum (`breathe|pan|field`); agent-authored
  configs cannot inject arbitrary CSS. `layoutMock` HTML is author-trusted.
- For a React app, render `<Loupe config />` from `@lucentive-labs/loupe-react`
  and import `@lucentive-labs/loupe-dom/styles.css` once.
- Add `dist/` to the example's `.gitignore`; the artifact is reproducible with
  `pnpm generate`.
