---
status: idea
added: 2026-11-13
---

# QA: damage numbers and banners linger

Severity: medium. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/ko-1.png, super-1.png

After a KO the floating damage numbers (12, 12, 11, 10, 8, 27) are still on screen 100 ticks later and clutter the K.O. text; FIGHT! stays under the super banner; the 'N HITS / N DMG' counter is large and overlaps the HUD. Under manual stepping this may be a frame-time artifact, so confirm in a live run before fixing.

## Progress 2026-11-26

Cause of the lingering numbers: the match-end pause counted as a sim pause, so `effectsHeld` froze the damage pops and HUD numbers for good after a KO (not only a manual-stepping artifact). Fixed: `effectsHeld(paused, ageing, ended)` no longer holds effects once the match ended (Arena passes `this.ended`). Test: `src/game/scenes/arena-logic.test.ts` (verified by reasoning: the old two-argument function ignored the third argument and returned true). Still open: FIGHT! under the super banner and the large "N HITS / N DMG" counter overlapping the HUD.
