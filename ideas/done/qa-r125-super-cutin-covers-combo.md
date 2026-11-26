# Super cut-in overlaps the combo counter text

status: done
added: 2026-11-19

Severity: minor
Size: S

Repro: Versus 2v2 (`/?manual=1&seed=7&ff=arcade#arcade`, size 2), land a hit chain, fill the meter (`arena.setMeter(0,3000)`), press 9, look 4 ticks later. Stepped play keeps frame-timed combo text alive, so confirm in live play before fixing.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/22-super-4-1280.png

Suggested fix: hide or fade the combo counter while the super cut-in banner is up, or move the banner away from the combo text.

triaged: 2026-11-21 real, but touches src/game/fx/super-view.ts and Hud.ts (off limits this pass). Plan: confirm in live play, then hide combo text while the cut-in shows.

## Progress note (2026-11-26)

status: done. The render fix already existed from 4bce6f61 (2026-11-21): `comboCutFadeOf` in `src/game/hud/hud-combo.ts` hides a counter whose box overlaps the cut-in band rows (`CUT_BAND_KEY`, published by super-view.ts); it only had a pure unit test. Added the live-game regression `tests/e2e/combo-super-cutin.spec.ts` (long gate: visual, about 50 s): builds a 3-hit combo, fires a super, asserts the counter overlaps the band (not vacuous) and its alpha is 0. It fails with the fade line removed and passes with it. No src/core change, no sim bump.
