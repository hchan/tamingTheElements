---
status: idea
added: 2026-11-15
---

# Hi-res mist portraits

Wispera (and any other translucent haze hero) reads poorly in 80 px portrait strips: the source is a thin, low-alpha mist. WP T2 only
lifted its strip alpha (`ALPHA_LIFT` in `tools/assets/portrait-rig/map-strips.py`) and made splash portraits scale smoothly.

- Bake a dedicated portrait for mist heroes from the 400x400 Large art with a soft dark under-glow, not a downscale of the sprite sheet.
- Let `map-strips.py` take a per-hero source (Large crop) instead of the idle/E sheet frame.
- Check every portrait surface: HUD, hero select, Versus tiles, garrison, splash, at 1x and 2x DPR.

Note 2026-11-16: Wispera now uses the Refined 2 redraw (ideas/done/wispera-refined2-swap.md).
