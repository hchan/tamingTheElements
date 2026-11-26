---
status: idea
added: 2026-11-26
---

# Integrate approved victory and KO stills for original heroes (curomo, ishimi, sindarosa)

Art session (2026-11-26), art worktree `.claude/worktrees/gpu-job-server`, approvals `.scratch/vic-orig/approval.json` (victory) and `.scratch/ko-orig/approval.json`, `.scratch/ko-orig2/approval.json` (KO).

Victory stills, art-director APPROVE 4 each (i2i d0.4 from the hero's own baked sprite on flat grey, 1024x1024): need the usual `tools/assets/victory-gen/victory-key.py` matte and scale (see commit 57da7ba8 for the pattern: provenance copy + `provenance/approval.json` entry + sha pin in `tests/repo/victory-frames.test.ts` + `VICTORY_HEROES`):
- curomo `.scratch/vic-orig/out/out/v-curomo_61001_d0.4.png`
- ishimi `v-ishimi_61001_d0.4.png` (static pose accepted, no limbs)
- sindarosa `v-sindarosa_61001_d0.4.png`
Not approved: rokcore (REVISE 3, idle stance), echo/lavax/morblass (REVISE 3), wispera (REVISE 2); round-2 i2i d0.5-0.6 queued (art session, rule 13).

KO stills (from the earlier verdicts): sindarosa `.scratch/ko-orig/sindarosa_ko.png` APPROVE 4; curomo `.scratch/ko-orig2/curomo_ko.png` APPROVE 4 (nudge a few px down onto the shadow). Integrate with an in-repo script into `public/assets/img/ko/`, CREDITS.txt, `tests/repo/ko-frames.test.ts` sha pin, add both to `KO_STILL_HEROES` and the `ko-still.test.ts` list. Originals are released heroes, so no flag gate. Remove curomo/sindarosa from any procedural-collapse list (see ../done/ko-procedural-wispera-lavax-morblass-echo.md: those six stay procedural: wispera, lavax, morblass, echo, rokcore, ishimi; ishimi KO is procedural but its victory still is approved).

Cast fx news (art session): Brazgor forgeGore/moltenHide REVISE (best seeds 111004 and 111012, round 2 queued); Ouroth scorchBreath failed twice, switching to a procedural cone (rule 13); Hyalia filament/bell REVISE (flat vector), reworking; procedural batch (talonRake, sporeBurst, hurlRock, boulderRoll, tentacleLash, abyssalPull, stoop, lureOrb) is with the director.
