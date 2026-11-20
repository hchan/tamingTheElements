---
status: in-progress
added: 2026-11-16
---

# HUD damage numbers and the TAG! call project with the 1280 frame on wide views

`Hud.ts` (damage numbers, ~l630) and `tag-view.ts` (~l258) project world points into `HUD_FRAME` (0..1280). On a wide view (844 px phones, left-handed: view width about 1462 to 1558) the HUD camera really shows x from `640 - viewW/2`, so x is squeezed by about 1280/viewW (0.82 to 0.875) toward the centre. This may feed the QA r74/r75 "damage numbers jammed together" finding. Reading the code only; not measured.

Follow-up: use `hudFrame(viewWidth)` (added by SNAG-CEIL-1 in `arcade-hud.ts`) for both, with a verifying e2e. Also check by screenshot whether the scrim and chip rows (drawn over HUD x 0..1280 only) leave the wide-view edge strips undimmed.

Update 2026-11-16 (DMGNUM-1): the damage numbers and the TAG! call now project with `hudFrame(viewWidth)`; the wide-view e2e in `tests/e2e/arcade-juice.spec.ts` (844x390) covers the numbers. Still open: the scrim and chip rows over the wide-view edge strips.

Progress 2026-11-20: the scrim (HudChrome.drawScrim) now overdraws 400 px each side of 0..1280 (SCRIM_OVERSCAN), so wide-view edge strips are dimmed; pinned by src/game/hud/hud-chrome.test.ts. Still open: the chip rows over the edge strips, and a real-game wide-view screenshot of the scrim.
