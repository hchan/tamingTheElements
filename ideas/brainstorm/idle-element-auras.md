---
status: idea
added: 2026-11-14
---

# Idle animation and element auras for every hero

Owner idea (2026-11-14): even when standing still, every elemental should animate, and each hero should have its own animation.

- Fire: a burning flame aura around the hero.
- Air: lightning crackling around the hero.
- Earth and water: my call. Starting points: earth sheds grit and dust, pebbles orbit, glowing cracks pulse and moss sways; water has rippling caustics, drifting droplets, a slow tide-swell shimmer and a wet sheen.
- Per hero, not just per element: a dragon breathes smoke and flexes its wings, a tree sways and drops leaves, Wispera pulses, and so on, using the per-sprite flags in `src/game/views/locomotion.ts`.

## Constraints

- Presentation only (no sim change); reduced motion keeps a calm steady pose; frame budget with 2 to 4 heroes on screen; the aura must not hide the hit box or hurt readability (the element must still read at a glance, not colour alone).
- Keep it distinct from ability auras (`ability-aura-view`) and status FX.
- Applies on the menu showcase as well (see the SD portrait rig plan) and to the 24-hero roster.
