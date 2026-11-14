---
status: in-progress
added: 2026-11-13
---

# Hero rigs from the painted portraits

Owner: the portraits look great, the in-game sprites "look soooo ugly" (thick outlines, flat fills, blurry upscale). Build each hero's
rig from its painted portrait (`public/assets/img/map/<hero>Large.png`), so the sprite keeps the painting. Design and decisions in
[ADR-0020](../../docs/adr/0020-portrait-rigs.md); tools in `tools/assets/portrait-rig/`.

Pass 1 (pilot, done in its branch): Pax, Sindarosa and Curomo. Changes:

- 240 px frames with a visual box;
- a supersampled smooth bake with bone-weight skinning;
- runtime box fitting;
- no grade on painted heroes;
- QA tests (`tests/repo/portrait-rig.test.ts`, `tests/e2e/hero-portrait-shot.spec.ts`).

Next:
- Pass 2: the other nine heroes, one spec each (bones, weight polygons, glows, shadow, animations).
- Sharper at 1920x1080 on 2x displays: 320 px frames or a sharpen pass in the bake. Today the 240 px frames are upscaled about
  2.4x there.
- True back views for N and NE (today the painting is mirrored and offset).
- Pass 3: retire the superseded `rig-gen` scripts for converted heroes, then move this idea to done.

Related: [bigger-hero-sprites](bigger-hero-sprites.md), [portraits-from-baked-sheets](portraits-from-baked-sheets.md),
[hero-rigs](../brainstorm/hero-rigs.md), [qa-hero-scale-small](../brainstorm/qa-hero-scale-small.md).
