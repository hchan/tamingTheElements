---
status: idea
added: 2026-11-15
---

# QA r50 scorecard (HEAD 92acd490, dev server port 7951, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r49 was 3.5 / 4.0 / 3.5). Screenshots: `~/claudetmp/qa-r50/s/`.

- Fun: 3.5 (=). 1v1 on all four stages, 2v2 tag (TAG! call, bench cards, 2.8 s tag cooldown), Tour stages 1 to 7 and a phone match to Victory 2-0 all ran with 0 page errors. Supers read as an event. New this round: crowd-control chips (SNAGGED 2s, STUN, SAFE) under the life bars make status legible mid-fight (`team2-tag-b.png`, `st-Fire-hit.png`). Still lacking: hit-stop feel (cannot judge from stills) and the FIGHT! banner glued onto the first hit.
- Graphics: 4.0 (=). Per-element floors and element-tinted super banners hold (`st-Air-super.png` PHOENIX RISE in orange on a violet floor). The hit mark is now a cyan or blue burst with a ring core, but on Fire, Water and Earth shots it reads the same pale-blue (`st-Fire-hit.png`, `st-Earth-super.png`, `ph-super.png`): the target's element tint is hard to tell. Idle auras are subtle: only a faint glow under Wispera (`st-Water-start.png`); Fiara shows no visible aura. Wispera still has a dithered pixel halo; menu hero cut-outs still have edge noise.
- Readability: 3.5 (=). Menu is clear on 1280x720, 844x390, 390x844 and 667x375. CC chips are readable. The Play picker now has a "More heroes below" pill. The 2v2 Versus picker still hides the partner slot behind the Fight bar; the first-run hint still covers the arena.

## Coverage

Menu (1280x720, 2560x1440, 844x390, 390x844, 667x375, reduced motion), Help, Settings, Online, Play picker, Versus 1v1 and 2v2 picker, 1v1 on four stages with hit and super, 2v2 tag, Tour stages 1 to 7 cards and fights, phone 667x375 full match to Victory. Not covered: two-browser Online, Tour 8 and 9, playwright e2e suite (not run this round), real-time feel of hit-stop and the menu entrance.

## Versus r49

No regressions found. Fixed or improved: Play picker scroll hint, CC status chips, phone landscape title (golem now clear at top right, only the dragon wing tip is near "Taming"). Still open: FIGHT! overlap, 2v2 picker bar covers partner, first-run hint overlay, Wispera halo, "ROUND" ghost behind TAG!, blurry Tour portraits. See qa-r50-findings.md.
