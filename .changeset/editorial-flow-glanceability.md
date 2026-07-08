---
"@lucentive-labs/loupe-schema": minor
"@lucentive-labs/loupe-core": minor
"@lucentive-labs/loupe-dom": minor
---

Glanceable decision flows + editorial theme preset.

- `question` (config-level default, per-group override): renders as the step's
  visual headline via the new optional `font-display` token; the group title
  demotes to a small-caps eyebrow.
- Progressive disclosure for long context: `promptLead` (always-visible lead
  line) + `promptCollapsible` (full prompt behind a `promptSummary` toggle,
  default "Full context"); open state survives re-renders.
- `THEME_PRESETS.editorial`: light "editor's desk" preset — paper ground, ink,
  a single editor-blue accent, serif `font-display`, system font stacks only,
  content-forward for text/decision flows.
- Decision specimens: `detail` now preserves line breaks, so tiles can carry
  full multi-paragraph copy blocks.
