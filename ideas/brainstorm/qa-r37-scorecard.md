---
status: idea
added: 2026-11-14
---

# QA r37 scorecard (headless Chromium SwiftShader, test build of main 8667a05b, port 7993 because 7992 was held by another worktree)

Scores 0-5 vs Street Fighter / MvC (r36 was 3 / 3.5 / 4).

- Fun: 3. Unchanged. Tour and 2v2 work, SINDAROSA IN! / TAG! calls land, but I could not capture plain-hit weight (see below).
- Graphics: 3.5. Four stages still distinct (sun/rain/sand/gale tints); the earth stage is the least grim. 3v3 Tour HUD (tag portraits both sides) reads well.
- Readability: 4. Pad labels, names and card placement all improved; remaining clutter is the FIRE x2 / AIR x2 pad chips.

Verified (all console-clean): menu, Play (Tour pick, Stage 1 of 9 card, splash, 3v3 fight), Versus 2v2, 1v1 on four stages, tag swap, KO swap, super, Help at 1280/667/844, phones 667x375 and 844x390.
e2e (E2E_PORT=7993): touch-fight-layout, first-run-hint, arcade-juice, arcade-tag = 29/29 passed, twice.
Screenshots: ~/claudetmp/qa37/ (sheet-swap, sheet-ko, sheet-667, sheet-stages, sheet-tour, phone-*, tag2-*, stage-*, tour-*, help-*).

## r36 fixes re-check
- Tag call no longer clipped at the left: PASS at 1280 and 667 (TAG! fully inside). It sits left of the hero rather than centred, fine.
- First-run card on phones: PASS. At 844 it sits low between the fighters' feet and above the action bar; at 667 it is under the fighters. The card waits until FIGHT! has gone.
- Pause vs hit counter: no overlap seen at 667/844 (Pause sits below the fullscreen button); the e2e covering the streak counter passes. No live streak on a phone captured in stills.
- Names whole at 667 and 844: PASS (SINDAROSA 210, FIARA 391/391, PAX 445/445).
- Pad labels: legible chips on dark plates. PASS. "Charge" and "Weather 0%" action-bar labels are intentionally dim but small at 667.
- Swap notice style: gold SINDAROSA IN! reads big and clear. Minor: it overlaps pad chips (FIRE x2), and at 667 it nearly touches the left edge.

## Plain-hit feel
Could not judge well: my scripted hit burst stacked the two fighters on one spot (my placement artifact), so there were no clean recoil frames. From live shots: hit spark + number + "N HITS / DMG" streak (top right) read well; a ring burst with orange slashes on hit; no visible knockback or camera shake in stills. See qa-r37-hit-feel-capture.md.

## Findings
- Minor: FIRE x2 / AIR x2 / WATER +HP terrain chips float over the arena and collide with calls (SINDAROSA IN!, TAG!) and sometimes fighters. Consider fading them after round start or lowering their depth under calls.
- Minor: a tag swap right after a hit is refused ("Can't swap: stunned") with grey text at the lower left, easy to miss.
- Minor: Tour stage card is text-dense at 1280 (Location/Opponent/Difficulty/LEVEL/CONTINUES in one block).
