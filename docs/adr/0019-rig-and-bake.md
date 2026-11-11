# ADR-0019: Cutout rigs baked offline into sheet frames

Status: accepted

## Context

The sheet pipeline (FUN-DESIGN 2.16) needs up to 9 actions x 5 authored directions of 80x80 frames per character, and drawing
every frame by hand is the costly part. Runtime skeletal animation would add a dependency, a renderer path and weight, and it
would differ by engine.

## Decision

Characters may be authored as cutout rigs under `imgWorkArea/rigs/<sprite>/`: part PNGs with pivots in a parent tree, integer
keyframe curves per action, optional hand-painted key frames, and `extends` for variants. `tools/assets/bake-rig.ts`
(`pnpm assets:bake`) bakes them offline into the per-frame PNGs that `pnpm assets:sheets` already packs. The bake is
deterministic, using integer degrees, a literal sine table, Q16 fixed-point matrices, nearest-neighbour sampling and png-lite.
`bake.lock.json` records input and output hashes, so `--check` catches a stale bake. W, SW and NW are never baked, because
they are mirrored at runtime.

## Consequences

The runtime, bundle and size budgets are unchanged: rigs are only another source of sheet frames, and hand-drawn frames still
work. Baked frames are reproducible on any machine with no new dependency. The cost is that nearest-neighbour rotation of
pixel art looks jagged at odd angles, so artists keep angles small or paint a key frame instead. Changing the algorithm
means bumping `BAKE_VERSION` and re-baking.
