# Loupe Product Contract

Status: canonical product authority. The README remains the user contract
for the current packages. Update this file whenever the product boundary,
current release truth, or adoption outcome changes.

## North Star

Loupe locks a visual or strategic decision by clicking a real option, then
exports a deterministic brief. An author describes the decision as typed
option tiles; a person or agent locks one by clicking it — a rendered image
crop, a color palette, a type specimen, a motion feel, a layout mock, or a
text tile that states the call and its trade-offs — and Loupe keeps a
markdown and JSON brief in sync with those locks.

The product is not a design system, a product-definition standard, a hosted
review app, a hosted control plane, or Ferry. It is the complete local loop
through which someone can install the published packages, author a config,
click a real option, and hand the next build pass a brief that will not
drift from the preview.

## User And Meaningful Outcome

The first user is a founder, designer, operator, or agent author who would
otherwise bury a visual call or a strategic trade-off in a paragraph, then
watch the next build pass guess.

The outcome is concrete: each open group is locked by clicking a real
option (or a write-in when every option is wrong); the composed preview and
the export brief derive from the same selections; and that brief — markdown
for a human, JSON for a machine — is the ground truth the next pass
consumes.

## Smallest Lovable Product

The current bounded product is the published, MIT-licensed OSS packages:

- install the published `@lucentive-labs/loupe-*` packages from npm;
- author a `loupe.config` that describes groups of real options;
- render those options as tiles;
- lock a tile in each open group;
- export the deterministic markdown and JSON brief.

Tiles may come from the portable `index.html` generator or the live React
adapter; both read the same config. That loop must work from package
install through a real lock and a brief that matches the preview. A
catalogue page, a Labs demo, a schema parse, or a screenshot of tiles
alone is not the Loupe product.

## Current Truth

As of 2026-08-23:

- The five packages are public on npm as `latest`, published through npm
  Trusted Publishing with provenance:
  `@lucentive-labs/loupe-schema@0.2.1`,
  `@lucentive-labs/loupe-core@0.2.1`,
  `@lucentive-labs/loupe-dom@0.2.1`,
  `@lucentive-labs/loupe-react@0.1.2`,
  `@lucentive-labs/loupe-generator@0.1.2`.
- Versions are split and pre-1.0. Security fixes apply to the latest
  published minor of each package; older versions are not patched.
- Schema, core, DOM renderer, React 19 adapter, and Node generator cover
  config validation, JSON Schema emission, SSR-safe selection state, crop
  math, composed preview, markdown/JSON brief, write-ins, locked groups,
  and a self-contained artifact.
- The Lucentive Labs catalogue page and live demo are presentation and
  discovery. They are not a hosted Loupe product, not a control plane, and
  not production-adoption proof. Canonical source and releases live in
  this repository.
- `serveCapture` is loopback-only with a per-server token. Browser
  `localStorage` is optional local persistence. Neither is a team store or
  a login.
- Groups are single-select. `layoutMock` HTML and image assets are
  author-trusted. Motion presets are a fixed safe enum.
- The hosted security workflow blocks leaked secrets and reports
  dependency and SAST findings under its v1 policy. A full
  dependency/SAST blocking scan is a separate release-candidate receipt
  until the hosted policy is strengthened.
- The public packages are usable without an account, hosted control plane,
  sales workflow, or Lucentive One session.

Verdict: Loupe is a real, bounded OSS product at pre-1.0 with split
package versions, not a hosted review app or design platform. Its current
package surface may be described as shipped; unimplemented north-star
extensions may not.

## Required End-To-End User Journey

1. The user installs the published packages and reads the config contract.
2. They author a `loupe.config` with groups of visual or strategic options
   and validate it (`parseConfig`, `validateConfig`).
3. They render tiles — by generating a portable `index.html` or mounting
   the React adapter. Open groups show real options; recommended picks
   seed the default; already-made calls can ride along as read-only
   locked groups.
4. The user locks a tile by clicking it, or writes in "something else"
   when the menu is all wrong. The composed preview recomposes from those
   selections.
5. The export brief — markdown and JSON — stays in sync with the same
   selections. Copy, `selectExportBrief`, or local `serveCapture` writes
   the brief without a hosted service.
6. The next build pass consumes that brief as ground truth.
7. The user can tighten the config, regenerate, upgrade a package, and
   report a vulnerability through a private channel without an account.

## Maintainer And Release Journey

The maintainer reproduces failures from config and fixtures, adds tests
for preview/brief determinism and renderer parity, runs typecheck, tests,
build, and publish-lint on the real tarball, records a changeset, merges
the generated version PR, publishes only through GitHub OIDC, and verifies
npm version, `latest`, provenance, and an install → config → tiles → lock
→ brief smoke from the published tarballs. A green source commit is not a
release until the registry artifacts and provenance are readable. This
repository owns source and releases; Labs catalogues and demos.

## Identity, Authorization, And Data

Loupe has no human account or hosted session. Config authorship, local
files, and the machine that renders the tiles are the authorities; none
is represented as a Loupe login. The export brief stores locked group
ids, option ids, labels, flags, write-ins, and banned/workflow prose —
not an identity.

Lucentive One is intentionally not required for this anonymous public
toolkit. Lucentive is an organization; it is not a login, a control
plane, or this product. If a future Lucentive-operated hosted or
collaborative surface introduces authenticated humans, it must use
Lucentive One from its first production slice while Loupe continues to
own product-local config, selection state, and the export brief. Browser
storage and a loopback capture server are not a replacement human login.

## Commercial And Ecosystem Boundary

The current packages are MIT-licensed Lucentive Labs open source and have
no paid entitlement, managed support promise, or hosted service. The
ecosystem handoff is discovery and demonstration through the Lucentive
Labs catalogue, then canonical source, installation, and releases in this
repository. Do not infer a paid or managed product from catalogue
publication, a live demo, or npm availability.

## Product Definition Of Done

A Loupe release is a `complete-surface-only` product increment when:

- the install → `loupe.config` → tiles → lock → markdown/JSON brief
  journey works from the published tarballs;
- preview and brief remain derived from the same selections, with
  determinism and renderer-parity coverage for the changed surface;
- the README and this contract match the exact published packages;
- typecheck, tests, package lint, and the hosted secret-blocking /
  reporting security policy pass for the exact release candidate;
- npm versions, `latest`, provenance, and a clean install are verified
  after publication; and
- no completion claim implies a design system, a product-definition
  standard, a hosted review app, a control plane, Lucentive One, or
  Ferry.

## Depth Before Breadth

Deepen the local lock loop before adding a platform: make published
install through brief export boringly reliable, keep preview and brief
from drifting, exercise the portable artifact and the React adapter from
the registry, and measure whether users reach a locked brief the next
pass can consume. Hosted accounts, collaborative review, team sync, a
design-system kit, a product-definition standard, and any Ferry-like
secrets surface are justified only when they solve an observed user
barrier that the complete local loop cannot.
