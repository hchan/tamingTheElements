---
status: planned
added: 2026-11-13
---

# Phone landscape: small play area, docks, no touch controls (QA 2026-11-13, r3, r4)

Earliest phone-landscape findings, kept as one file; later rounds are in qa-phone-and-tour-r38-r41.

Merged from: `qa-phone-landscape-touch`, `qa-r3-phone-landscape-docks`, `qa-r4-phone-fight-no-touch-controls` (old file names kept here so older scorecards that cite them still resolve).

<!-- merged from qa-phone-landscape-touch.md (added 2026-11-13) -->
## QA: phone landscape play area is small and no touch controls were visible

Severity: medium. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/vp-844x390.png, vp-390x844.png

At 844x390 (isMobile, hasTouch) the arena is a 690 px wide strip with the HUD taking about a quarter of the height, and no joystick or touch buttons were visible, only the action bar. Portrait shows only a rotate-your-device modal. Verify the touch controls appear after a real touch.

<!-- merged from qa-r3-phone-landscape-docks.md (added 2026-11-13) -->
## 844x390: docked Fight/Start bar and tall menu hide most content

Severity: high (phone). At 844x390 the menu shows only Play, Versus and part of Online. Versus shows only filters behind the docked Fight!/Back. Play's Start tour covers the hero cards. In the fight no joystick is visible, the 48 px buttons are small, and the first-hint card takes about a third of the screen.

Fix: a compact phone layout (2-column menu, non-sticky dock on short heights, hint as a one-line toast, visible stick).

Screenshots: ~/claudetmp/qa/r3/ph-menu.png, ph-versus.png, ph-tour.png, ph-fight.png, phone.png.

Update 2026-11-13: CSS-only compact landscape block at the end of src/ui/styles/main.css (max-height 500px): 2-column menu, static docks, 12 px Versus/Play pickers, one-line first-run card. Still open: a visible touch stick (none exists; movement is keyboard only on touch), Play intro paragraph size. Screenshots: ~/claudetmp/qa/phone-fix/.

Update 2026-11-13 (touch-stick): the visible touch stick is done. `src/game/app/touch-stick.ts` adds `#touchStick` (132 px ring, 8-way, dead zone, holds the bound move keys like a keyboard; mirrored with the left-handed Side setting), appended next to the action buttons in Versus and the World Tour fight, shown only under `@media (pointer: coarse)` (CSS at the end of main.css). Tests: `src/game/app/touch-stick.test.ts`, `tests/e2e/touch-stick.spec.ts` (844x390 touch context, plus no stick for a mouse). Remaining open, so the status stays planned: Play intro paragraph size, the 48 px ability buttons are still the canvas-bar overlays (not enlarged), first-hint card still says "arrows or WASD".

<!-- merged from qa-r4-phone-fight-no-touch-controls.md (added 2026-11-13) -->
## Phone fight shot shows no touch stick or attack buttons

In the 844x390 fight no visible stick or buttons appear (touch stick still open per phone-landscape idea). Action bar icons are about 30 px, HUD text very small.

Evidence: ~/claudetmp/qa/r4/16-phone-fight.png
