---
status: idea
added: 2026-11-15
---

# Pseudo-3D animations for abilities, specials and status effects

Owner, 2026-11-15: "maybe we can have SOME 3d ... like animations when they do their ability and special and/or stun, rooted, etc".

Goal: heroes feel dimensional when they cast a special or ability and when they are stunned, rooted, snagged or frozen. The game is a 2D rigged-and-baked renderer on Phaser 4, so "3D" most likely means pseudo-3D done in the pose layer, not a 3D engine:

- squash/stretch and anticipation, lunge toward the camera (scale plus shadow), turn-around card flips (X-scale through zero with shading)
- per-part depth (parallax between limb layers, rotating the body layer with a lighting gradient)
- shader/filter tricks from Phaser 4 (see `node_modules/phaser/skills`): lighting, displacement, perspective warp on a sprite
- status looks: stun (dizzy stars orbiting in a tilted ellipse), root (vines climbing with depth), freeze, snag rope wrapping

Open design calls for the planner: which of these stays inside the art budget and Fiara's painterly look, whether any real 3D is worth it, and performance on phones. Presentation only, no `src/core` change. Single-owner shared files: `pose-layer.ts`, `src/game/fx/*`.

Related: [hero-rigs](hero-rigs.md), [move-animation-wings-knees](move-animation-wings-knees.md), [sf-stun-dizzy-bar](sf-stun-dizzy-bar.md).
