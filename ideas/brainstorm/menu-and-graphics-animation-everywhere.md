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
