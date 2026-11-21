---
status: idea
added: 2026-11-18
triaged: c (items 1,2,3,4,5,7,8,10 fixed or obsolete; open: #11 shorter intro banners and #12 Easy AI opening damage, both design or balance; plan: Opus plan for #12 with balance:compare, #11 a small scene-timing work package; #6 and phone parts of #9 obsolete, #9 desktop text is the Help landing page and is intended)
---

# QA r110 findings

Build main 380e0c83, dev server, headless Chromium (SwiftShader), seed 7, Sindarosa/Pax/Curomo tour stage 1 (Air). Viewports 1280x720 (d), 844x390 (l), 390x844 (p). Screenshots in `.scratch/r110/`. No console errors on any path.

1. **Major: landscape phone, the "Stage 1 of 9 / 3 continues left" plate covers the first action-bar tile (Blast, key 1).** Repro: 844x390, Play > Start tour > Fight. Shot: `.scratch/r110/l-g1.png`, `l-h1-tap.png`. Move the plate above the bar or drop it during a round.
2. **Major: touch Run tile gives almost no feedback and the bar is tiny.** Repro: 844x390 or 390x844, tap the Run box (48 px). The aria label goes to "Run Away, 5s" but the tile text is a 9 px "Run Away 7s", with no "on" state like desktop ("Run Away on" plus gold outline, `key-run-active.png`). In `touch-run-active.png` the hero was already SNAGGED and STUN while the tap landed, so Run did nothing visible, and no message explains why. Show a "Can't run: rooted" or a pulsing ring.
3. **Minor/Major (feel): keyboard Run Away of a ranged hero runs straight into the corner.** Repro: desktop, Tab at start. Positions (arena.characters): hero x 480 > 305 > 144 > 4 in 1.5 s, y jumps to 205 while pinned at the wall, and the foe is on top of it by 2 s, taking damage in the corner. Run is a 5 s commit with no escape; versus an SF back-dash this is a trap. Consider ending the run at the wall (or curving along it) and a short invulnerable start. Shot: `key-run-active.png`, `d-h1-tab.png`.
4. **Minor: portrait phone main menu: label and subtitle run together** ("PlayA tour of nine fights", "HelpHow to play", "Settings" with a four-line subtitle). Shot: `.scratch/r110/p-menu.png`. Stack title over subtitle or add a gap.
5. **Minor: portrait phone pre-fight screen has the FIGHT button below the fold** (the controls card plus nine stage tiles fill the screen); the player has to scroll to find it. Shot: `p-f2.png` (no button visible), `p-prefight-scrolled.png`. Pin FIGHT to the bottom like Start tour.
6. **Minor: portrait fight is shown behind a "Rotate your device" modal**, and after "Play anyway" the HUD is a 6 px-text strip (SINDAROSA 175, SUPER 14%) with the stage plate overlapping the top-left portrait. Readable only by squinting. Shots `p-g1.png`, `p-h1-tap.png`.
7. **Minor: status plates (SNAGGED 18, STUN, NO SNAG 1s) sit directly under the tag portraits and the ROUND 1 / SAFE plates; on landscape phone they crowd the HUD and clip against "CHARGE!" call-out.** Shot `touch-run-active.png`, `d-f4-tab2.png`.
8. **Minor: desktop Gale call-out stack overlaps.** "GALE +20%" is half hidden behind the "GALE 10" box under the foe tag strip, and "Gale!" floats mid-arena at the same moment. Shot `d-f5.png`. Merge into one pill.
9. **Minor: Help shows "Open a section to read it." while How to fight is already open on desktop and the jump chips wrap into three ragged rows**; on landscape phone the Back link is not visible and the Jump-to row is cut off at "R..." (scrolls). Shots `d-Help.png`, `l-Help.png`.
10. **Nit: Run is the only action with no gamepad button** (Help says so, honest). Also Help step 6 "Run" does not mention Tab, while the table and the stage card do ("` Tab Run"). The stage-card key legend (1 Strike, 2 Special, C Snag...) names a Snag key although the action bar for Sindarosa has no Snag tile.
11. **Nit: intro banners (SINDAROSA / WISPERA / ROUND 1) are huge and pad about 3 s before input**; the first Tab/move during FIGHT! was ignored in an early attempt. For an SF feel, shorten, and show a visible "ready" moment. Shot `d-f4-tab2.png`.
12. **Nit: on the first 6 s of a tour stage the AI lands 53 damage before a player can react** (hero 228 > 175 at 86 s on an "Easy" stage in desktop and landscape runs). Easy should leave a few seconds of openings.

Worked well: five-item menu with exact names, no forbidden words on any screen; Help controls tables are complete and include Run Away / Run Towards for keyboard, P2, gamepad and touch; the weather badge (GALE 10, AIR x2 floor chips, Weather 0% tile) reads clearly on desktop; hero panel labels melee/ranged with "(Run Away)" / presumably "(Run Towards)".
