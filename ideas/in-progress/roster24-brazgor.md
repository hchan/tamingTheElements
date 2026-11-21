---
status: in-progress
added: 2026-11-20
---

# Roster24 hero 2: Brazgor (fire, melee)

Plan: .scratch/plans/roster24-one-hero.md (section 3, rank 2). Release set stays empty until the audit gate passes.

## Progress

- 2026-11-20 step S (SIM_VERSION 91): Forge Gore de-duped from Wyrm Coil and Stoop (both 90x60 heavy, 400 ms recovery): now a slow overhead
  anvil blow, 30 dmg, 2000 ms cooldown, 600 ms recovery, 70x80 box (narrow and tall, no lunge, no grab). Molten Hide unchanged.
  Same bump: Kindrel Ember Bite recovery 150 -> 160 ms (tick-neutral: 8 ticks either way). Numbers in the SIM_VERSION 91 note and CHANGELOG.
- 2026-11-20 P1 rig and bake done (art-director APPROVE 4.0, KO revise 1 of 2 used): source mirrored to face east, quadruped spec + tune
  script, procedural KO keys (buckle, slump, edge-on roll, belly-up; tools/assets/portrait-rig/brazgor-ko-keys.py), sheet and map strip.
  Provenance: tools/assets/portrait-rig/provenance/brazgor-approval.json. Art stays hidden (RELEASED_ROSTER24 untouched). Follow-ups from
  the director: tilt the last KO frame a few degrees, darken its shadow ~15%, nudge walk frame 2, edge-on KO frame may flicker.
- 2026-11-20 P2 and P3 (presentation only, no src/core): brazgor-fx.ts (Forge Gore overhead arc plus impact ring, Molten Hide ember ring) painted in
  ability-aura-view.ts from the action-bar readyTick rise, reduced motion held still; lesson words for forge-gore and molten-hide in
  ability-lessons.ts; ABILITY-AUDIT rows updated. Not done: a hit-confirm FX on the foe (no sim event), thorns flash.
- Still to do: flank-glow art fix, audit gate, Pyre Totem ally no-flinch zone (slot 3, later), release flip (R).
