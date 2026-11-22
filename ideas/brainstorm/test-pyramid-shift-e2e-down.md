---
status: idea
added: 2026-11-22
---

# Shift checks down from e2e to unit/dom/integration

Measurements (2026-11-22 full run): 118 e2e entries, 480 pass / 5 fail, 82 min on the PC. `hero-portrait-shot` is about 940 s of 4652 s serial (about 20%); also slow: super-band, ability-fx, hero-scale, responsive, stage-hazards, combo-anchor (6.6 min).

Ranked:
1. CORRECTED 2026-11-22 (builder check): all 12 `*-shot` specs are already P2 and tiers only decide whether a red blocks a push; nothing skips a spec in the full run, and the full run is the nightly run, so a retier saves nothing unless a less-frequent visual lane is added (medium WP: testIgnore/grep-invert in playwright.config.ts + test-tiers.ts + docs/TESTING.md). Only `fight-hud-shots` and `ability-icons-shot` have no expect(); the other ten assert. Better first lever: make `hero-portrait-shot` itself cheaper (about 940 s) or run the visual lane weekly. Not started.
2. S moves, each with a test that fails without the behaviour: playtest-replay and replay-input-display to core/dom; first-run-hint, a11y-features, help-controls text asserts to dom; hit-mark-element palette distinctness (pure); keyboard Enter/Escape/Space routing.
3. M moves: combo-anchor + callout-pop-lanes via one pure layout module; hero-scale, sprite-sheets; idle-aura and move-backward (state checks plus one loose pixel smoke per element); stage-hazards timing as a core Node test (no sim change); responsive, tester-mode.

Rules: keep every `@smoke` and at least one e2e per feature; delete or shrink an e2e only after the replacement is shown to fail when the behaviour breaks; src/core changes need an Opus plan; a new e2e spec needs a stated reason; shared files one agent at a time.
