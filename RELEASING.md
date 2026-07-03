# Releasing Loupe

Loupe publishes the `@lucentive-labs/loupe-*` packages to npm via
[Changesets](https://github.com/changesets/changesets) and **npm Trusted Publishing
(OIDC)** — there is no long-lived `NPM_TOKEN`. GitHub Actions exchanges a short-lived OIDC
token for publish rights, and every package ships with a provenance attestation.

## One-time setup (operator)

These steps are done once, by a human with org admin rights. The repo is already wired for
them (`.github/workflows/release.yml`, `.changeset/`).

1. **Create the npm org / scope.** Create the **`@lucentive-labs`** organization on
   npmjs.com (the scope does not exist yet). Add the maintainers.

2. **Make this repository public.** Provenance + Trusted Publishing require a public repo
   and public packages. (`Settings → General → Change visibility → Public`.)

3. **Allow Actions to open PRs.** `Settings → Actions → General → Workflow permissions` →
   enable **"Allow GitHub Actions to create and approve pull requests"** (Changesets opens
   the "Version Packages" PR).

4. **Configure the Trusted Publisher** for each package (or once at the org level) on
   npmjs.com → the package/org → **Settings → Publishing access → Trusted Publisher →
   GitHub Actions**, with:
   - **Organization / user:** `LucentiveLabs`
   - **Repository:** `loupe`
   - **Workflow filename:** `release.yml`
   - **Environment:** *(leave blank)*

   Packages: `@lucentive-labs/loupe-schema`, `-core`, `-dom`, `-react`, `-generator`.
   (Until a package exists on npm you may need to do the first publish with a granular token,
   then switch to Trusted Publishing — or create the empty package first. The workflow
   already requests `id-token: write` and upgrades npm to `>= 11.5.1`.)

## Cutting a release (routine)

1. Every change that affects a published package lands with a **changeset**
   (`pnpm changeset`) — CI does not enforce a token, but reviewers should check one exists.
2. On merge to `main`, the **Release** workflow runs Changesets:
   - If changesets are pending → it opens/updates a **"Version Packages"** PR (bumps
     versions, writes `CHANGELOG.md`). **No publish happens here.**
   - When you **merge that Version PR** → the workflow runs `pnpm release`
     (`build:packages && changeset publish`) and publishes the bumped packages to npm with
     provenance via OIDC.
3. The very first release bumps everything `0.0.0 → 0.1.0` (see
   `.changeset/loupe-v1-initial.md`).

## Verifying a publish

```sh
npm view @lucentive-labs/loupe-core           # version is live
npm view @lucentive-labs/loupe-core dist.attestations  # provenance present
```

The npm page's "Repository" and "Homepage" links should resolve to this repo and
`https://labs.lucentive.io/libraries/loupe`.

## Local pre-flight (any contributor)

```sh
pnpm -r build && pnpm -r test && pnpm -r typecheck
pnpm lint:publish    # publint + are-the-types-wrong on the REAL pnpm tarball
```

`lint:publish` validates the exact bytes a consumer installs (it packs via `pnpm pack`,
which applies `publishConfig` and resolves `workspace:*`). Note: `attw --pack` on its own
reports false "NoResolution" failures because it does not apply `publishConfig`; always
check the packed tarball, as `scripts/check-publish.mjs` does.
