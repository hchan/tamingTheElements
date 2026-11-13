---
status: in-progress
added: 2026-11-13
---

# Grim arena environments (floor, props, atmosphere)

Owner feedback on a real screenshot: the arena was a flat muddy-brown grid with random cracks, the rocks were brick boxes with text labels, and
there was no depth, so the grim hero art sat on a beige board. Presentation only (no `src/core`, sim coordinates and hitboxes unchanged).

Done in this work package:
- `tools/assets/tile-gen/tilefloor.py`: dark desaturated per-element palettes (scorched basalt, wet slate, storm-grey cloud-stone, mossy flagstone),
  seamless multi-scale noise, grain and faint joint lines; deterministic (fixed seed). Regenerates `public/assets/img/tilefloor.png`.
- `src/game/fx/terrain-props.ts`: earth obstacles drawn as boulders, broken pillars and crystal clusters (contact shadow, cracks, moss);
  no on-canvas text (the word stays in the `labels` state for tests and a11y).
- `src/game/fx/terrain-ambient.ts`: per-element drifting motes and mist (embers, cold motes, dust and spores, wind streaks), pooled, none with reduced
  motion; a per-element vignette with light falloff as one canvas texture in the Hud scene.

Next: Phaser 4 Lighting (normal-mapped floor lit by the weather), per-element props for fire, water and air patches (lava vents, ice floes, wind
stones) instead of ground decals, parallax fog layers, screenshots of every element in the e2e visual specs.
