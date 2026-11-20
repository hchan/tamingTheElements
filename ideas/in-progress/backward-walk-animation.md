---
status: in-progress
added: 2026-11-14
---

# Backward-walk animation, per-elemental

Owner idea (2026-11-14): heroes need a real animation for walking backwards. Moving backwards behaves differently from moving forwards (the sim already walks backwards at 50% speed, SIM_VERSION 67), and each elemental moves in its own way, so each needs its own backward mechanics and look.

## Direction

- Detect "backing away" in the view from the held direction versus the foe's side (the same rule as `backwardWalkX` in `src/core/sim/systems/arcade/walk.ts`), not from facing alone.
- Per-elemental backward gait: legged heroes (Pax, Treenoc, Lavax, Rokcore) take shorter, guarded, braced steps, leaning with the weight back; Sindarosa and other winged heroes back-flap, hovering with the head still facing the foe; fluid and air heroes (Morblass, Ishimi, Echo, Cyclonius) drift or ripple back, with the body keeping its face to the foe; Wispera backs away in a bobbing arc.
- Slower cadence to match the 50% speed so feet do not slide; the foe stays facing front.
- Builds on `src/game/views/locomotion.ts` and `pose-layer.ts` (per-sprite flags). Presentation only, no sim change; reduced motion keeps a steady pose.
- Longer term, real backward frames in the baked sheets once the rig and portrait work lands (see the SD portrait rig plan).

## Open

- Whether the cue is a pose-layer transform (cheap) or new baked frames per hero.
- Per-hero tuning table, with a unit test per hero and a headless screenshot strip.

## Landed (Phase 1, view-only)

- `src/game/views/locomotion.ts`: `BACK_GAIT` table by sprite id (styles brace, backflap, drift, arc, recede, none), `backingAway(x, px, foeX)` mirrors the sim `backwardWalkX` rule from the actual step, `facesToward`, `walkTimeBack`/`walkFrameBack` (the walk row played reversed), `applyBackGait`.
- `src/game/views/pose-layer.ts`: eased `back` amount (0..1) per character; forward cues fade out as it rises; no reversal while stunned, guarding, rooted, in an event pose, in victory, or on a held diagonal; Classic never reverses; reduced motion keeps the reversed frames with no rotation.
- Tests: `locomotion.test.ts`, `pose-layer.test.ts`, `tests/e2e/move-backward.spec.ts` (probe `arena.sheets()` now reports `back`).
- Screenshot strips in `~/claudetmp/shots/backward-walk/strip-*.png` were not informative (the crop caught a crystal effect over the hero); the e2e probe asserts the frame order instead. Gait constants were not tuned by eye.
- Phase 2: see `ideas/brainstorm/backward-walk-baked-rows.md`.

## Progress: scoping 2026-11-20

- Phase 1 (pose-layer transform, per-hero `BACK_GAIT` table, tests, e2e probe) is already landed; the open question "pose-layer vs baked frames" is answered: transform now, baked later.
- What remains is Phase 2, `ideas/brainstorm/backward-walk-baked-rows.md`: a baked "walk-back" row per hero.
- Size: large and risky. It needs the rig/bake pipeline (tools/), a change to `assets/sheet-spec.ts` (WALK_FRAMES pin), regenerated sheets and atlas manifest, size-budget edits, and art-director approval of new art, i.e. art generation plus shared files. More than 8 files.
- The other open item (per-hero tuning by eye with screenshot strips) is subjective art tuning; the earlier strips were not informative, so it needs a better capture method first.
- Decision: no build in this pass, nothing small left to implement. Next step is an Opus planner for Phase 2 (rig/bake plan, sheet-spec change, manifest and budget impact).
