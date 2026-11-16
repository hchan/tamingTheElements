---
status: in-progress
added: 2026-11-16
---

# Portrait phone fight layout

QA r79, r80 and r81 scored the portrait fight 2.5. Target 3.5 or better. Plan: `~/claudetmp/plans/portrait-layout-plan.md` (Opus), split into P1 to P5.

- P1 (done locally): `html[data-portrait-play]` (coarse-pointer portrait only, set after "Play anyway", at once in Online, never in cinematics, owner token for teardown), canvas pinned under a 52 px top strip, Pause, fullscreen and the Tour chip in the strip, `pauseLeft` guard in Hud.ts, `src/ui/styles/portrait-play.css`.
- P3: one-row action bar with 44 px touch skirts below the canvas, dark textured control-deck background.
- P4: at most 2 status chips per fighter, one-line first-run card.
- P5: QA screenshots, a11y pass (thumb reach), scorecard.

By design the display-size setting is ignored while the flag is on (the canvas is always full width). Older browsers without `cqw` or `:has()` fall back to the old centred layout. iOS safe areas cannot be checked headless.
