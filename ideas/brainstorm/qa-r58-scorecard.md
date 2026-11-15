---
status: idea
added: 2026-11-15
---

# QA r58 scorecard (HEAD b740d971, dev server port 7943, headless Chromium SwiftShader)

New since r57: roster Batch 2 heroes (Brazgor, Glimmaw, Durrok, Zephra) behind `?ff=roster24`. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r57 was 3.6 / 4.2 / 3.7). Screenshots: `~/claudetmp/qa-r58/s/` (about 35 files: menu at three sizes, picker, 1v1, 2v2, phone landscape and portrait, four new heroes with intro, hit, ability, super).

- Fun: 3.7 (+0.1). Four more kits with distinct ability icons (Gore/Charge, Lure Orb/Tidecall, Tusk Gore/Stoneskin, Mote/Gale) and different silhouettes lift variety; the core 1v1 loop is unchanged.
- Graphics: 4.2 (=). Super banners (ABYSSAL LURE, PHOENIX RISE) and arenas remain strong. The new sprites are uneven: Glimmaw is a good readable anglerfish, Durrok is fair, Brazgor has a pale outline halo that looks cut out, Zephra is too small.
- Readability: 3.6 (-0.1). Zephra is about 60px against Fiara at about 200px and washes out on the lava floor (`r-zephra-hit.png`), a clear scale mismatch for a fighter. Phone portrait is still the black-top-half layout. The tiny hero is the main reason for the dip.

E2E subset (port 7942, 1 worker): cc-fx, first-run-hint, idle-motif, roster24-b1-shot, roster24-b2-shot, status-fx, tester-mode, hud-labels-sf, hero-picker-layout, 40 of 40 passed. touch-fight-layout.spec.ts:267 (known) not run.

Page errors: none in any scripted run.
