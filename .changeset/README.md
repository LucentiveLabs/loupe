# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets).
Each changeset is a markdown file describing the version bumps for one logical
change, plus a human-readable summary for the changelog.

- Add one with `pnpm changeset` (or author a markdown file by hand).
- Versions and changelogs are applied by `pnpm changeset version`.
- Publishing is wired in `.github/workflows/release.yml` through npm Trusted
  Publishing with provenance. A pending changeset produces a Version Packages
  PR; merging that PR publishes the resulting versions.
