# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).
Each changeset is a markdown file describing the version bumps for one logical
change, plus a human-readable summary for the changelog.

- Add one with `pnpm changeset` (or author a markdown file by hand).
- Versions and changelogs are applied by `pnpm changeset version`.
- Publishing is wired in `.github/workflows/release.yml` and is **gated off**
  until the repository and the `@lucentive-labs/*` packages are public and an
  npm trusted-publisher is configured (see the spec, §0.10).
