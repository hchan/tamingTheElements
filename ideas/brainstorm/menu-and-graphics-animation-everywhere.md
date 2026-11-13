---
status: idea
added: 2026-11-13
---

# More animation everywhere: menus and graphics, with Stable Diffusion art

Owner idea (2026-11-13): EVERYTHING, everywhere needs more animation in menus and graphics; use Stable Diffusion for the art.

## Sketch

- Stable Diffusion (SDXL-Turbo, local, `tools/assets/concepts-dark.py` style) makes stills, not motion. Motion comes from how the stills are used: separate generated layers (backdrop, mist, embers, rain, vortex rings) drifting at different speeds (parallax), seamless looping textures, slow breathing scale and glow on portraits, and tweens.
- Menus: animated dark backdrop per screen (element-themed mist, embers, water caustics, storm streaks), focus and select transitions, screen-to-screen wipes, hero portraits with idle breathing and eye glow, button hover and press feedback.
- In-game: HUD tweens (cooldown fill, buff pop, life drain trail), hit and KO flashes, stage ambience layers, win and lose card entrances.
- Generated art must be committed with its generator in `tools/assets/`, graded grim (desaturated, textured), seamless where it loops, with the model licence noted in the licence docs.
- Respect reduced motion (static fallback), high contrast, and the size budgets (lazy chunks; compress loops; prefer CSS/tweens over video).
- Related: [[effect-sprite-style-pass]], [[sf-stage-backgrounds-crowds]], [[tour-select-screen-redesign]], [[mvc-character-select-with-ability-info]].

## Abilities too (owner, 2026-11-13: "same with abilities")

- Every ability gets richer animation: anticipation (wind-up glow/telegraph), a travelling or impact effect with layered SD-generated textures (embers, ice shards, vortex rings, rock debris) animated by frame cycling, scale/alpha curves and trails, and a lingering aftermath (scorch, frost, dust) that fades.
- Per element families share a look; supers and Weather get the biggest treatment; ability icons on the action bar pulse on ready and animate on cooldown.
- Builds on [[ability-telegraphs]] and [[effect-sprite-style-pass]]; keep it view-only (no sim changes) and within the fx chunk budgets.
