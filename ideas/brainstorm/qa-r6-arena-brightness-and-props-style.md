---
status: idea
added: 2026-11-13
---

# QA r6: water and air floors too dark; earth props clash with the floor; Ishimi FX box

Evidence: tourfight-1.png (air floor, murky blue-purple), fight-*.png, hero-*.png in ~/claudetmp/qa6/.

## Problems

- Air and water floors are dark, murky blue-purple with low-contrast pads; the target look is mystic, bright, luminous, painterly. Fire (glowing lava cracks) is the best of the set; earth floor is the brightest and most painterly.
- Earth props (pillars, boulders) are flat vector shapes with thick black outlines and clash with the painted floor.
- Bug: the Ishimi attack FX renders a blue swirl inside a hard-edged rectangle (clipped quad artifact, looks like a texture with an opaque or unpremultiplied background).
- Dark heroes (Cyclonius brown-black, Wispera near-invisible) lose contrast against dark floors.

## Suggested fix

- Lift air and water: lighter base value, a luminous mid-ground (light shafts, caustics, cloud wisps), and keep pads clearly a step brighter than the floor.
- Repaint or re-bake earth props with painted shading and no black outline (match the floor).
- Find the Ishimi FX texture (premultiply / blend mode / frame padding) and fix; add a screenshot e2e at the attack frame.
- Add a soft rim light or ground glow behind dark heroes, or a subtle contrasting outline, so they read on any floor.
