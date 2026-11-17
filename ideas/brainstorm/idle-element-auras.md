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

## Follow-up (2026-11-16)

Owner request: "idle life for every hero". Applies to all 24 heroes: slight rigged movement even when standing still (breathing and sway, cloth and hair) plus automated per-element ambient effects (fire glow and embers, Wispera lightning crackle while still, water ripple, air swirl, earth dust). Uses the rig (the 12 roster24 heroes need their rigs first, see hero-rigs.md) plus procedural particles and shaders (Phaser 4 particles and filters skills). Render-only, no sim change; keep it cheap on phones (cap particle counts, share emitters, skip when off-screen). Size L. GPU-suitable: no (procedural). Owner-gated: no for effects; yes for any new art. Part of the standing rigging-refinement backlog in hero-rigs.md.
