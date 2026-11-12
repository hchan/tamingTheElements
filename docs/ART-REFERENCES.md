# Art references (study, do not copy)

Research notes from 2026-11-12 (idea `ideas/brainstorm/free-sprite-research.md`). Nothing here was downloaded or imported. The game's art is
original and procedurally generated (`tools/assets/rig-gen/`); these sources are for **style study**. Importing any asset needs a licence note
in the manifest (see `docs/FUN-DESIGN.md`) and, for attribution licences, an in-game credits entry. Licence terms below come from the sites'
own pages and search summaries, not legal advice; re-check the asset page before any import.

## Licence table

| Source | Licence | Attribution | Import verdict |
| --- | --- | --- | --- |
| [Kenney](https://kenney.nl/support) (all packs) | CC0 1.0 | none needed | Safe to import. Style is flat, clean vector-like; useful for UI and tiles, less for rich heroes. |
| [OpenGameArt Pixel Art Spells](https://opengameart.org/content/pixel-art-spells) | CC0 | none | Safe. Greyscale projectile shapes (fire, ice lance, rock, wind) meant to be tinted: best fit for tintable effects. |
| [OGA "cc0 special effects" collection](https://opengameart.org/content/cc0-special-effects) | CC0 per item (collection of links) | none | Safe per item (Earth Impact, Fire Wrath, Pixel FX Pack); confirm each page. |
| [OGA Magical or Elemental Attacks collection](https://opengameart.org/content/magical-or-elemental-attacks-art-collection) | Mixed, page states none | check each | Reference only until each item's licence is read (earthspike, ice patch, fireball, elemental absorption). |
| [OGA JS Monster Set - Elementals](https://opengameart.org/content/js-monster-set-elementals) | Check page | check | Reference for elemental creature silhouettes. |
| [SpritePilot free assets](https://spritepilot.com/free-game-assets) | CC0 (per site) | none | Frost-contrail crystal spike and flaming ball, 8 frames at 12 fps: good timing reference. |
| [Liberated Pixel Cup / LPC](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles) | CC-BY-SA 3.0 + GPL 3.0 (some items CC0, CC-BY or OGA-BY) | required, credits file reachable in-game | Reference only: share-alike would infect derived sheets. [LPC Revised](https://github.com/ElizaWy/LPC) is CC-BY 3.0 / OGA-BY 3.0, usable with credit. |
| OpenGameArt licences ([FAQ](https://opengameart.org/content/faq)) | CC0 / CC-BY 3.0, 4.0 / OGA-BY 3.0 / CC-BY-SA / GPL | CC-BY and OGA-BY need credit; OGA-BY drops the DRM clause | Accept CC0, OGA-BY, CC-BY. Avoid SA and GPL art. Record the exact licence version. |
| [Patch pixelfx](https://patch.gg/patch/pixel-effects) / [Sprite Fusion VFX](https://www.spritefusion.com/pixel-art-vfx) | MIT (code-drawn effects) | licence notice | Reference for procedural effects with palette ramps plus a separate glow buffer; matches our generator approach. |
| itch.io golem packs ([tag list](https://itch.io/game-assets/free/tag-golem), [Batareya](https://batareya.itch.io/pixel-art-golems-elementals-sprite-pack)) | Varies per page; Batareya's is AI-generated | check | Reference only. Provenance of AI-made packs is unclear, do not import. |
| [Lospec palettes](https://lospec.com/palette-list/endesga-32) (Endesga 32/64, Resurrect 64) | Site says free to use, credit optional (no formal text) | optional, credit anyway | Fine to borrow ramps as study; our own ramps are already hand-set. |
| Paid itch.io packs (e.g. [GandalfHardcore projectiles](https://gandalfhardcore.itch.io/pixel-art-projectile-effects)) | Paid licence | n/a | Look at preview only. |

## Style lessons (what makes the good ones look rich)

Sources: [Slynyrd Pixelblog 1](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes), [pixel-editor.com outlines](https://www.pixel-editor.com/articles/pixel-art-outlines),
[the-pixel.art hue shifting](https://the-pixel.art/articles/hue-shifting-pixel-art-shading/), [ParticleFX fireball notes](https://particlefx.studio/pixel-art/fireball).

1. **Hue-shifted ramps, 4 to 6 steps.** Straight brightness ramps look flat. Shift hue about 10 to 20 degrees per step: shadows toward blue/purple,
   highlights toward yellow/orange (flip for cool light). Darker steps carry more saturation; lower saturation again at the brightest step.
2. **Outline in the darkest ramp colour, not black.** Use a per-element dark (near-black of its own hue). Selective outlining: dark where the form
   turns from the light, one lighter step on the lit side. One pixel per edge, one per corner; no doubled lines.
3. **Silhouette first.** If the pose does not read with detail blurred away, shading will not rescue it. Break the outline with spikes, horns, tufts,
   asymmetric limbs; avoid a rounded blob.
4. **Few shading steps, clear light direction.** 3 to 5 flat bands with one consistent light (we use upper-left). Add a one-pixel rim on the lit
   edge that is lighter than the base, which separates the sprite from a same-hued floor.
5. **Contrast against the floor.** Keep the sprite's value range wider than the floor's; the floor stays mid-value and low-saturation, heroes get the
   darkest dark and the brightest highlight on the screen.
6. **Accent colour for life.** One saturated accent (glowing cracks, eyes, gems) against a desaturated body draws the eye; glow is a separate
   additive layer, not a lighter ramp step.
7. **Rock and earth creatures.** Read as chunky stacked plates with visible seams, cracks, lichen or moss on top surfaces, uneven plate sizes and one
   or two oversized parts (fists, shoulders); warm browns and ochre with a cool purple shadow beat grey. Crystal or amber veins add the "magic".
8. **Effects: shape language per element.** Fire is a teardrop with a flickering tail and shed embers, white-yellow core to red edge. Ice is hard
   angular shards with a pale cyan core, white sparkle pixels and a frost contrail. Earth is chunky debris with ground cracks and dust puffs. Air is
   thin curved streaks and swirl rings with few colours and a high-contrast leading edge.
9. **Projectile versus impact are separate sprites.** Looping projectile: 6 to 12 frames at about 12 fps, 8 to 12 art pixels wide at our zoom. Impact:
   10 to 20 frames, bigger than the projectile, with a bright first frame (white flash) then fade through the ramp.
10. **Animate by squash, anticipation and overlap**, not just colour cycling: a 2 to 3 frame wind-up, one oversized frame at the strike, trailing
    parts lagging a frame behind.
11. **Palette discipline.** One shared master palette (about 32 to 64 colours) per element family so heroes, effects and tiles harmonise; derive
    variants by hue-rotating a ramp (Slynyrd: 8 ramps, 45 degrees apart).

## Recommendations

1. **Pax (`tools/assets/rig-gen/pax.py`).** Keep the warm `RAMP_STONE` but add a purple-leaning shadow step (e.g. 46,34,46 toward 52,36,66) and
   push the lightest step to a warmer yellow; the ramp is already near this, so the main gain is silhouette: add 2 to 3 oversized plates (shoulder
   boulders, one larger fist) and a ragged top edge so the shape reads without colour.
2. **Pax outline.** Make the outline selective: `OUTLINE` on the shadow side, a stone-ramp step-1 colour on the lit side, and keep the 1-px rim
   (`RIM`) only on the upper-left. Check against the blue Air floor and sandy Earth floor in a screenshot, not just the sheet.
3. **Pax detail budget.** Limit to 4 stone bands plus amber accent; reduce mottling noise on large plates (it reads as grey fuzz at game zoom) and
   put the detail into seams, cracks and moss on top faces only.
4. **Curomo ice-shock effect.** Replace a soft glow blob with angular shards: pale cyan core (about 200,245,255), mid cyan, deep blue-violet outline,
   white sparkle pixels, and a short frost contrail of 3 to 4 fading shard fragments. Separate sprites: 6 to 8 frame loop (projectile) and a
   10 to 14 frame burst impact with a one-frame white flash, then ground frost that lingers. Reference: SpritePilot frost spike, OGA Pixel Art Spells ice lance.
5. **Greyscale tintable effect shapes.** Generate effect sprites in greyscale ramps and tint per element at runtime (the Pixel Art Spells approach)
   so fire, ice, earth, air projectiles share silhouettes; each hero then needs only colour ramps, saving budget. Pair with the Phaser 4 glow
   filter for an additive glow layer instead of baking glow into the sheet.
6. **Fire heroes.** Teardrop with flickering tail and embers, white-yellow core; add heat-orange rim light on neighbours is optional. Share the
   ramp function in a common helper so `pax.py`, `treenoc.py` and future rigs use one `ramp()` plus a `hue_shift(ramp, deg)`.
7. **Air heroes.** Rely on silhouette: swirl rings and trailing streaks with only 3 colours and a bright leading edge; keep floor contrast by using
   a darker blue-grey than the Air floor.
8. **Shared palette file.** Add one `palette.py` in `tools/assets/rig-gen/` with a per-element 5-step ramp and a master list, and a small script that
   reports each sprite's lightest/darkest value against each arena floor (an automated contrast check; see `docs/VISUAL-QA.md`).
9. **Do not import AI-generated packs** (e.g. the Stable Diffusion golem pack). If real assets are imported, prefer CC0 (Kenney, OGA CC0) and list
   them in the manifest licence notes.
