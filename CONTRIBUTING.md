# Contributing to Loupe

Thanks for your interest in Loupe. This is a small, sharp toolkit — the bar is high on
clarity, determinism, and zero-surprise behavior. Contributions that keep it that way are
very welcome.

## Development setup

Loupe is a [pnpm](https://pnpm.io) workspace. You need Node `>=20` and pnpm `10.x`.

```sh
git clone https://github.com/LucentiveLabs/loupe.git
cd loupe
pnpm install
pnpm -r build       # build every package (renderers depend on the core build)
pnpm -r test        # unit + conformance tests
pnpm -r typecheck
```

The packages form a dependency chain: `loupe-schema` → `loupe-core` →
`loupe-dom` / `loupe-react` / `loupe-generator`. Build before testing the renderers.

## Project layout

```
packages/
  loupe-schema     Zod config contract + JSON Schema + validator
  loupe-core       zero-dependency headless core (the logic lives here)
  loupe-dom        vanilla browser renderer + styles.css
  loupe-react      React 19 adapter
  loupe-generator  Node-only self-contained-artifact builder
examples/
  brand-starter    asset-free worked example + Playwright verification
skills/loupe       the end-to-end agent authoring method
```

## Ground rules

- **The core stays zero-dependency.** `loupe-core` must not gain runtime dependencies.
  Renderers are thin views over it; logic belongs in the core.
- **Determinism is a contract.** The export brief and composed preview derive from the same
  selections and must never drift. No timestamps, no absolute paths, sorted keys.
- **Renderer parity is enforced by tests**, not by assertion — `loupe-dom` and `loupe-react`
  must produce identical structure/classes/ARIA from the same config.
- **Motion is a fixed safe enum** (`breathe | pan | field`); never allow arbitrary CSS from a
  config. `layoutMock` HTML is author-trusted.

## Making a change

1. Fork and branch from `main` (`feat/...`, `fix/...`, `docs/...`).
2. Make the change. Add or update tests — every package has `src/*.test.ts[x]`.
3. Run `pnpm -r typecheck && pnpm -r test && pnpm -r build` locally.
4. **Add a changeset** describing the change and the semver bump:
   ```sh
   pnpm changeset
   ```
   This is required for any change that affects a published package. Releases and
   changelogs are driven by [Changesets](https://github.com/changesets/changesets).
5. Open a pull request. CI runs typecheck, tests, build, and publish-lint
   (`publint` + `@arethetypeswrong/cli`) on every PR.

## Releases

Maintainers merge the auto-generated **"Version Packages"** PR to cut a release; publishing
to npm happens automatically via GitHub Actions using npm Trusted Publishing (OIDC) with
provenance. Contributors never need an npm token.

## Questions

Open a [discussion or issue](https://github.com/LucentiveLabs/loupe/issues). For the full
authoring method (including the agent path), see [`skills/loupe/SKILL.md`](./skills/loupe/SKILL.md).
