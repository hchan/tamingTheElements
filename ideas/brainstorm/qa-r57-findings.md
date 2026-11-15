---
status: idea
added: 2026-11-15
---

# QA r57 findings (HEAD fe84ba90)

Screenshots under `~/claudetmp/qa-r57/s/`.

## Fixed since r56

- CC chips: MIRED, STUN, DAZED chips now have an icon and a coloured border (`ov-mired-1.png`, `cc-daze-cyclonius-16-3.png`, `st-Water-super.png`) and stack with SAFE/SNAGGED in 2v2 (`team2-tag-b.png`). The dim DOWN chip from r56 did not reproduce (Pax's Special 2 is a self buff in this build, so no DOWN was seen; not retested with a real downing source).
- CC overlay exists: `ccFx()` probe reports a mired hero with 4 parts and 2 segs; the Classic Tornado crack fires (`ov-crack.png`); the 4 cc-fx e2e specs pass.
- Tester panel polish merged; the 5 tester-mode specs pass including "God mode checkbox is on screen with no scrolling".
- FIRST BLOOD card "not dismissing" was a harness artifact: the card mounts a few ticks after the arena is ready, so a click right after ARENA_READY finds nothing. Clicking after stepping dismisses it (`fb-after2.png`, 0 buttons left). The first-run-hint e2e passes 4 of 4. The card still covers the bottom of the arena until dismissed or timed out.

## Still open

- Phone portrait (390x844): top ~40 percent black, arena a ~100px strip with a tiny HUD and a large FIRST BLOOD card below (`pport-match.png`). Fill the space or scale the arena; this is the largest readability gap and persists since r55.
- CC body cue is faint: the mired ring is a thin circle at the feet and the stun/daze victim shows no pose or tint change (`ov-mired-1.png`, `cc-daze-cyclonius-16-3.png`). The chip sits at the top of the screen, far from the victim (about 200px right of the hero in the daze shot). Compare Street Fighter dizzy stars over the head; add a stronger on-body marker or a tint, or anchor the chip to the victim.
- Kindrel's basic hit shows no spark and the sprite blends into the lava floor (`r-kindrel-hit.png`); Nykra is slightly translucent but readable on lava (`r-nykra-hit.png`), still weak on the Void floor (not re-shot).

## New observations

- Hero picker at 667x375: only the top of the page shows (options plus two panels), with the hero grid behind the sticky bar (`ph-pick-a.png`); needs scrolling to pick, no cue except the bar overlay. At 1280x720 "More heroes below" works and the Air row is faded under the bar (`pick-1v1.png`).
- Menu is clean and shows the 5-entry list plus the build hash (`menu-desk.png`).
- Classic demo view (`?ff=arenaDemo`) shows debug-style HUD text ("HP 100% OK", "cap 100%", "rested") and a near-black stage; fine for a demo but not player-grade (`ov-demo-40.png`).
- QA harness only: the Tour stage 9 script crash (r56) was not re-run.

## Coverage

Menu at 1280x720, 667x375, 390x844; Versus picker (1v1) at 1280x720 and 667x375; 1v1 in Fire/Water/Earth/Air with hit and super; 2v2 tag swap; phone landscape fight with Pause and touch pads; phone portrait fight; roster24 heroes Kindrel, Nykra, Quarrak, Hyalia (intro, hit, ability, super); CC overlay mired, stun scan, Classic tornado crack; the CC chips for daze/down; E2E subset of 29 specs.
