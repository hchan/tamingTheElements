---
status: idea
added: 2026-11-16
---

# QA r77: findings (main 76a0c7e7)

Screenshots in ~/claudetmp/qa-r77/. Scripts: sup2.cjs (supers, 844/667/568/1280, near and far), snag.cjs, dmg.cjs. No console errors in any script run. Note: the worktree had no node_modules, so I symlinked the main checkout's (removed again, not committed).

| Item | r77 result | Evidence |
|---|---|---|
| HINT-CUT-1: hint card waits for the super band | FIXED. At 844x390, 667x375 and 568x320 the band (HAILSTORM, PHOENIX RISE, SIREN GALE) plays with no card on it; the card appears after the band. Backed by 3 new e2e cases (1280, 844, 667), all pass | sup-p844-morblass-near-3.png, sup-p667-morblass-near-3.png, sup-p568-fiara-near-3.png, e2e/hint-cut-844x390-band.png, e2e/hint-cut-844x390-card-after.png |
| SNAG-CEIL-1: SNAG/HEAL pops stay below status chips | FIXED for SNAG. The SNAG word sits under the ADREN/STONE chips and the scrim at 1280 (e2e shot). My own forced setup (caster at y=60 with four chips) showed no SNAG word at all in 4 frames at 1280/844/568, so the pop is held or hidden near the top; I did not see HEAL | e2e/snag-ceil-1280x720.png, snag-d1280-0..3.png |
| New small-viewport e2e (E2E-SMALL-1) | Works. 568x320 overlap, super band and left-handed cases pass; one `test.fail` pins the fullscreen toggle bug | e2e.out |
| Fullscreen toggle covers HUD at 568 | STILL OPEN (not new, pinned by test.fail). Toggle overlaps the foe portrait and the end of its life bar ("LAVAX 400" sits right against it) | sup-p568-fiara-near-3.png, crop568.png |
| Wispera plain orb | STILL OPEN. Plain blue orb as HUD icon and in the arena, next to detailed Rokcore | sup-p667-wispera-near-3.png, snag-d1280-1.png |
| Colliding damage numbers (DMGNUM-1, in progress) | Still present, not re-reported: "16" tucked under "36" at 844 | dmg-p844-3.png |

## New, minor

1. SNAG word is rendered grey and low contrast against the lava floor (e2e/snag-ceil-1280x720.png). It reads as a ghost; the other pops are white with outlines. Idea: give it the same outline as damage numbers.
2. At 844x390 the first-run card (top-left, y 100-148) sits over a "FIRE x2" floor chip and, at 667, it is close to the centre damage number ("40") during a live exchange (dmg-p667-2.png). Cosmetic; the card is dismissible.
3. "WINS WINS" under the round dots at 844/667/568 has no left/right separation (two labels collide into one string); at 1280 they are spread apart.
4. "WEATHER 0%" tag hangs under the timer on every size, drawn over the arena top edge; it reads as a debug box at 0%. Consider hiding at 0%.
