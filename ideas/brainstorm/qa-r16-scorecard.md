---
status: idea
added: 2026-11-14
---

# QA r16 scorecard (r16)

Headless Chromium on a test build of main (dc5724c6), seed 7: 1280x720, phone landscape 844x390, portrait 390x844. Shots and scripts in ~/claudetmp/qa-r16/. E2E subset (arcade-super, arcade-tag, life-readout, hit-juice-shot): 11 of 11 passed. No console errors in any run.

Scores vs Street Fighter / MvC (0-5): fun 3.5, graphics 3.5, readability 3.5 (up from 3.0).

Working: menu, four stage floors with ambient motion, hi-res Rokcore and Lavax look good, shared-scale life bars read correctly (Rokcore 358 vs Echo 633 clearly different), "Can't swap: stunned" tag feedback, super cut-in band and zoom, Tour stage strip labels fit on desktop, phone landscape HUD shows legible "Life n/n" text, portrait shows the Rotate prompt. Not checked: KO punch-in did not trigger in my script (the target survived).

New findings: qa-r16-pax-hurt-frame-squashed, qa-r16-super-hit-lacks-impact, qa-r16-first-run-card-over-cutin, qa-r16-help-wheel-text-on-art. Minor, not filed: intro name watermarks have low contrast on same-element stages (PAX on water, ROKCORE on earth); locked Tour tiles show a lock icon plus the word LOCKED.
