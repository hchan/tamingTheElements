---
status: in-progress
---
# Grim pass on the HUD (health bars, action bar, banners, pads)

Owner feedback (2026-11-12): "all of your new changes look too cartoony". Stage floors and backdrops are now dark, muted and textured (2026-11-13 screenshot review of `~/claudetmp/grim1`), but the HUD around them still reads cartoony:

- Health bars are flat saturated green (0x00ff00-ish) on both sides; want a desaturated, darker fill with a subtle gradient, grain and a thin dark frame, and a colour ramp (sickly green to ember red) as health falls.
- Action bar tiles and the right-hand ability tiles are bright blue rounded slabs; want dark slate with a thin muted-element edge.
- The FIGHT! banner is huge cream block text; want smaller, ash-coloured, a brief fade and a dark stroke.
- Trap pads on the floor are crisp flat rectangles with bold labels (WATER +HP, FIRE x2); want softer edges, lower alpha and smaller labels.
- Hero sprites are small next to the arena (see the size idea in hero-rigs.md).

Keep every cue readable without colour (shape/word coded, high-contrast and reduced-motion modes unchanged). Compare with real headless screenshots against Fiara.
