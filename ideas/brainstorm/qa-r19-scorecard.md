---
status: idea
added: 2026-11-14
---

# QA r19 scorecard (r19)

Headless Chromium on a test build of main (ade6d63b), seed 7: 1280x720 and phone landscape 844x390 (touch). Shots in ~/claudetmp/qa-r19/ (hazards in haz/). E2E subset (arcade-super, arcade-tag, ko-fx-shot, stage-hazards, arcade-pan, first-run-hint, hero-scale): 31 of 31 passed. No console errors in any run (menu, Play, super, KO, 2v2 and tag on both viewports).

Scores vs Street Fighter / MvC (0-5): fun 3.5, graphics 3.5, readability 3.5 (all unchanged from r18).

Landed since r18: single super number, slimmer First Blood strip, compact phone Help header, no stray TAG caption. The 2v2 HUD (bench portraits with TAG label, a Tag slot on the bar) reads well.

Working: five-entry menu, Versus panel (opponent, team, AI, arena), lava, water and air stages with hazard telegraphs, FIRE x2 tags, Super pips, status chips, hit and damage counters.

Findings: qa-r19-ko-number-still-ghosted (readability), qa-r19-ko-punch-in-not-visible-in-shots, qa-r19-phone-letterbox-wastes-screen, qa-r19-hazard-strike-frames-low-contrast. Not checked: earth stage strike, Firefox and WebKit looks; the punch-in could not be judged in manual stepping.
