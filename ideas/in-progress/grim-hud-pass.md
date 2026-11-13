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

## Pass 2 (2026-11-13)

Done: ROUND banner smaller, serif, ash, moved above the centre pad label; SAFE/status chips squared dark slabs with muted tones; weather plaque squared ash slab with muted badge and charge colours; timer ash-white, lighter; trap pads feathered, element-muted, grainy; capture-ready highlight muted ochre; pure test for the red end of the health ramp.

Still cartoony: the full-screen saturated red low-life vignette, the yellow active-bar frame outline, TAG READY text, the "Rain!" call overlapping FIGHT in the first frames, hero sprite size.

## Pass 3 (2026-11-13)

Done: low-life vignette is now dark blood-brown (0x1f0a07), radius 0.85, strength x0.45, with a still hashed grain layer (Hud.edgeGrain, no flicker) that follows it; LOW word cue and reduced-motion steady strength unchanged. Tag view: active-bar frame is a dark rim under a thin ochre line, ready bar muted ochre with ash dashes (high contrast keeps white). Trap range outlines thinner and element-muted. Snag tutorial hint is an ash-ochre serif on a dark slab.

Still cartoony: hero sprite size, "Rain!" call overlapping FIGHT in the first frames, white fullscreen button, bright orange/purple portrait frames, trap pads are still flat rectangles with tile-spike glyphs in a bright tan.

## Pass 4

- Terrain pads redrawn as floor decals (`src/game/fx/terrain-pad.ts`): ragged feathered stain, grain, per-element scorch cracks / ripples / scratches, small muted rune, dim corner ticks; high contrast keeps the hard outline. Glow halo and particles muted.
- "Rain!" weather call held (transparent) until the FIGHT banner has finished.
- Fullscreen button and orange/purple portrait frames muted (high-contrast overrides kept).
- Still cartoony: hero sprite size and outline, bright ability icons, HUD fonts.
