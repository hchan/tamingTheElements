---
status: idea
added: 2026-11-14
---

# QA r18 scorecard (r18)

Headless Chromium on a test build of main (81b29218), seed 7: 1280x720 and phone landscape 844x390 (touch). Shots in ~/claudetmp/qa-r18/. E2E subset (arcade-super, arcade-tag, ko-fx-shot, layout-r15, hero-scale): 19 of 19 passed. No console errors in any run.

Scores vs Street Fighter / MvC (0-5): fun 3.5, graphics 3.5, readability 3.5 (unchanged from r17; the r17 fixes landed: super band no longer hides the first number, KO numbers sit under the caption on desktop, and the phone K.O. caption is clear).

Working: five-entry menu, Play pick, Versus panel (opponent, team, AI, arena, fire/water/earth/air), Help, lava floor with traps and FIRE x2 tags, HUD with Super pips and status chips, super cut-in band, KO wash, phone touch stick and letterboxed HUD.

Findings: qa-r18-super-number-doubled (readability, the main one), qa-r18-first-blood-hint-covers-arena, qa-r18-phone-help-header-eats-screen, qa-r18-stray-tag-label-over-arena. Still open from r17: qa-r17-ko-no-camera-punch-in.
