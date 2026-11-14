---
status: idea
added: 2026-11-14
---

# QA r7: dark heroes vanish on the air floor; sprite mismatch persists

Evidence: fight-air.png (Echo is a faint dark swirl on blue-grey while Pax reads strongly), hero-select.png, tour-stage1.png (blocky upscaled Wispera and Cyclonius portraits on flat blue boxes).

- Echo on the air stage is nearly invisible; add rim light or a ground glow for dark heroes.
- Heroes lack contact shadows; Pax (legacy bitmap) looks pasted on next to the rigged Sindarosa and Curomo. A shared bake step (soft shadow, rim light) is still wanted.
- Tour opponent portraits are low-res and pixelated.
- The floor-label clutter and flat life bars from qa-r6 are unchanged (see the scorecard file).

## Progress (hero-contrast agent, 2026-11-14)

Done: rim light plus mild body and alpha lift for the graded legacy heroes (`rimLightRgba` in src/game/fx/hero-grade.ts; Echo now holds a crisp bright silhouette on the air floor, Lavax gets a warm ember rim against the painted Pax); Arcade heroes already carry a contact shadow. Still open: pixelated tour opponent portraits, floor-label clutter, flat life bars.
