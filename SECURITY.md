# Security Policy

## Supported versions

Loupe is pre-1.0. Security fixes are applied to the latest published minor of each
`@lucentive-labs/loupe-*` package. Older versions are not patched — please upgrade.

## Reporting a vulnerability

**Do not open a public issue for security reports.**

Please use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/LucentiveLabs/loupe/security) of this repo.
2. Click **"Report a vulnerability"** and fill in the advisory form.

This opens a private channel with the maintainers. We aim to acknowledge within 3 business
days and to ship a fix or mitigation for confirmed issues as quickly as is practical, after
which we will publish an advisory crediting the reporter (unless you prefer to remain
anonymous).

## Scope notes

Loupe's threat surface is small by design:

- `motion` presets are a fixed safe enum — a config cannot inject arbitrary CSS.
- `layoutMock` HTML and image assets are **author-trusted**: only render configs from a
  source you trust, exactly as you would with any code you import. Treat an untrusted
  `loupe.config.ts` as untrusted code.
- The generated artifact inlines your own JS/CSS/assets; it adds no network calls of its own.
