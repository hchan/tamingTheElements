---
status: done
added: 2026-11-13
---

# QA: two e2e specs are red on main 4ddd5ca4 (one more Cleanse button and guide card than the tests expect)

Severity: high (CLAUDE.md says main is always green). QA evaluator pass 2026-11-13. Screenshots: ~/claudetmp/qa/shots/hit-2.png (action bar now ends with the 9th slot, '= Cleanse').

Ran with one worker against a fresh test build: 11 passed, 2 failed.

- tests/e2e/arcade.spec.ts:22 (desktop 1280x720 touch buttons, 2v2 and 3v3): `#game button[id^="arcade"]` count is 9, the spec expects 8. The new Cleanse button was not added to the expected count.
- tests/e2e/guide.spec.ts:4 (Help links to the Guide): `.guideCommon` count is 9, the spec expects 8. The Cleanse card was added to the Guide without updating the spec.

Likely cause: the Cleanse feature merged without updating both specs. Fix the expected counts (9 buttons, 9 common cards) after confirming the extra element is Cleanse, and re-run the 1 worker gate several times. The other specs run (arcade-trap, arcade-super, rest of arcade) passed.

## Update: full-suite run

The first background run (E2E_PORT 7940, 1 worker) in fact ran the whole suite: 266 passed, 15 failed. The failures all look like the same stale button or card count (the touch button count moved from 8 to 9 with Cleanse):

- arcade-pan.spec.ts:118 (action bar fixed while the camera pans and zooms)
- arcade.spec.ts:22 and guide.spec.ts:4 (above)
- responsive.spec.ts:181 (touch buttons on a coarse screen, 9 viewport variants) and :238 (high contrast, 568x320 and 640x300)
- tour.spec.ts:125 (expects 9 menuButtons on a touch device; the count differs)

Note tour.spec.ts expects 9 where arcade.spec.ts got 9 and expected 8, so the specs disagree about the count: check which is authoritative before editing.

## Resolved

Full e2e on current main (worktree, 1 worker): 288 passed twice in a row (2026-11-13); counts were fixed by later merges.
