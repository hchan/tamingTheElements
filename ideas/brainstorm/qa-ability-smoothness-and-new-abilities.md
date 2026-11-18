---
status: idea
added: 2026-11-18
---

# QA: ability smoothness and new hero abilities

How the coordinating session checks [smooth-abilities-and-new-hero-abilities](smooth-abilities-and-new-hero-abilities.md) without the owner. Headless only; browser runs go to the 4060 PC through `pnpm e2e` (never a Mac browser).

## Smoothness (per ability in the first batch)

1. Sim timing: a unit test in `src/core` steps a fixed seed and asserts the tick of the cast, the first active tick, the hit and the end of recovery. A render-only change must leave these numbers and the goldens untouched (`pnpm test`, `pnpm test:legacy`).
2. Frame strip: in manual Versus (`?hero=<hero>&foe=<foe>&manual=1`) step the sim and save screenshots at ticks 0, 2, 4, 8, 12, 16, 24, 32 (the plain-hit capture idea in [qa-hit-feel-r34-r40](qa-hit-feel-r34-r40.md) already wants this tool; build it once and reuse). Build a contact sheet per ability and look for jumps: a position or scale change larger than about a quarter of the sprite size between adjacent frames is a candidate (an estimate, to be tuned after the first sheets).
3. Reduced motion: confirm the eased motion is skipped, as in the other fx.
4. Score each ability pass or fail in a short table in this file; fails stay in brainstorm.

## New abilities

1. Per ability: add-ability skill checklist (data, sim, events, tests), plus a replay check that the new ability does not change existing goldens (only new fixtures are added).
2. `pnpm balance:compare` before and after; report the deltas; no baseline re-record without a stated reason.
3. A headless AI-vs-AI run (`pnpm sim:match`) with the new hero, to confirm the AI uses the ability and no stalemate appears.
4. A screenshot of the cast with placeholder art, to confirm the effect is visible at all.

## Hand-off

Art from the GPU session lands separately; re-run the frame strip after it merges.
