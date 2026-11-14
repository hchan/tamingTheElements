---
status: idea
added: 2026-11-14
---

# QA r17 scorecard (r17)

Headless Chromium on a test build of main (f92013c3), seed 7: 1280x720, phone landscape 844x390, portrait 390x844. Shots in ~/claudetmp/qa-r17/. E2E subset (arcade-super, arcade-tag, ko-fx-shot, layout-r15): 16 of 16 passed. No console errors in any run.

Scores vs Street Fighter / MvC (0-5): fun 3.5, graphics 3.5, readability 3.5 (unchanged from r16).

Working: menu, four stages (water, earth, air reached by weather swap; each telegraphs then changes floor), super cut-in with the new gold number and shock rings, KO wash peak captured (about 0.59 at 200 ms), 2v2 tag swap, Tour, Help, Settings, phone landscape HUD and touch pad, portrait Rotate prompt with Play anyway.

Findings: qa-r17-ko-no-camera-punch-in, qa-r17-ko-damage-numbers-bury-caption, qa-r17-super-band-hides-first-hit-number. Not repeated: the Versus stage picker (versus-stage-picker) already covers the fire-only start.
