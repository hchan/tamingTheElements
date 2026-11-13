---
status: in-progress
added: 2026-11-12
---

# Effect sprite style pass (shards, teardrops, tintable greys)

Follow-up from docs/ART-REFERENCES.md. Redo the element effect sprites (Curomo ice-shock, fire, earth, air) with element shape language: angular ice shards with frost contrail, fire teardrops with embers, chunky earth debris, thin air swirls. Separate looping projectile (6 to 12 frames) and a bigger impact (10 to 20 frames, white flash first). Consider greyscale sheets tinted per element plus a Phaser 4 glow filter. See ability-audit and phaser4-effects.

Progress (2026-11-13): looping strips (8 frames, 12 projectiles) and 12-frame impacts (fire, ice, earth, air, water, void) generated procedurally by tools/assets/fx-gen/batch-i-loops-impacts.py; projectile-view cycles the loops, the Phaser fx sink plays impacts (src/game/fx/impact-view.ts). Open: weather particles, glow filter, per-hero tuning, Ice impact has no element hook yet (no ice element).
