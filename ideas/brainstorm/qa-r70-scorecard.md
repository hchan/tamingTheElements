---
status: idea
added: 2026-11-16
---

# QA r70: scorecard (WALL-3 wall pin fix, ORIG-1 restored Fiara/Treenoc/Cyclonius)

Build: main 4d383fa3, test-mode build on E2E_PORT 7970, headless Chromium (SwiftShader), 1280x720, 390x844 (touch), 844x390 (touch). Shots in ~/claudetmp/qa-r70/ (menu, play1, versus1, card-{Fiara,Treenoc,Cyclonius}, m-*-{intro,fight}, wall-{Hard,Normal}-*, phone-*). No console or page errors in any capture. e2e specs were not run this round (play-through and screenshots only).

## Scores (0 to 5 vs Street Fighter / Marvel vs Capcom)

- Fun 3: the fights work and Hard now stops sitting on a pinned player; opening seconds are still passive (idle heroes trade nothing until the AI closes in) and Normal still pins the player at the wall.
- Graphics 3.5: stages (fire, water, air) look good and Fiara reads well; the restored Treenoc fragments at round start and Cyclonius looks like three different creatures (picker, HUD, arena).
- Readability 3.5: HUD is clean (bars, numeric HP, super pips, status chips); "FIRE x2" tags sit on top of hero names and Treenoc and Cyclonius lose contrast against the fire floor.

## Checks

- Menu: Play, Versus, Online, Settings, Help only; no Classic, Arcade, ruleset or Capture text on the menu, Play, Versus pages. PASS.
- Restored art, picker and info card: Fiara (red/orange firebird), Treenoc (gold tree) and Cyclonius (blue striped tile) icons show; info cards show Snag for Treenoc, Tornado and Wind Cone for Cyclonius. Picker OK, but Cyclonius label touches the tile edge. 3.5/5.
- Restored art, arena: Fiara 4/5 (bright, readable). Treenoc 2.5/5 (grey, halo, breaks into fragments at round start). Cyclonius 2.5/5 (blocky pixel figure when idle, swirl when casting, a dragon in the HUD).
- Wall behaviour: Hard AI holds a gap, 120 vs 15 x for a player pinned at the left wall over 320 ticks, one hit only (WALL-3b works). Normal AI crowds and chains the pinned player (about 190 HP lost in 320 ticks, positions overlap). 4/5 for Hard, as designed.
- Hero clamp at the wall: Fiara at x 15 is cut by the screen edge in the Hard shot (wings off-screen). 3/5.
- HUD: stable, 4/5. Round banner, hero name slide-in, WEATHER bar, status chips (STUN, SAFE, EMBER, NO SNAG, GALE) all legible on the three stages.
- Touch layout 390x844: rotate overlay offers "Play anyway" (fixed since r69); after it, the arena is a thin strip in the middle of a black screen (about 170 px of 844), the hint card is bigger than the arena. 2.5/5.
- Touch layout 844x390: playable, joystick and Strike 1/2 sit over the arena edges; the hint card covers the left HUD chips and the enemy is partly under the Pause and Strike buttons. 3/5.
