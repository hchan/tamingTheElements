---
status: idea
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
