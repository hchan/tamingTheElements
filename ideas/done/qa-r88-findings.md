---
status: done
triaged: superseded (portrait/touch dropped)
added: 2026-11-16
---

# QA r88 findings

Round r88 on main 38723182. Headless Chromium, seed 7, shots in `.scratch/r88/` (gitignored). No code changed. Covered 390x844, 360x640 and 1280x720 with Curomo (melee), Sindarosa (ranged) and a 3v3 (Sindarosa, Pax, Curomo vs Fiara). Landscape 844x390 and the menu, Help and Versus picker were not re-checked. No console or page errors. Tiles measured from `.touchSkirt` boxes.

## r87 fixes verified

- P1 (orphan tiles): Curomo at 390 is 5+4 and 3v3 is 5+5, both centred (row 1 x = 35..291, row 2 x = 67..259 for the 4-row) at 64x64 px. No lone Cleanse. Same at 360.
- P4 (STUN label): benched Tag tiles now read WAIT at 390, 360 and desktop.

## Ranked findings

### P1. Portrait drops Blast / Ice Shock for melee and 3v3 too, not only ranged heroes
Desktop Curomo has Ice Shock on key 1 (1280 shot, tile 1 of 10) and the 3v3 desktop bar has Blast and Flame (keys 1, 2). Portrait Curomo (9 tiles) and portrait 3v3 (10 tiles) have neither; the bar starts at Snag or at the Tag tiles. A melee hero's only ranged option in portrait is then Strike 1 or 2, if those map to it. The change was meant for ranged heroes (the one-row bar); the melee and 3v3 bars lose the same tiles. If Strike 1 and Strike 2 cover Blast and Flame this is intended, but nothing on screen says so (the Help copy still names Blast).
Shots: `.scratch/r88/p390-melee-1fight.png`, `.scratch/r88/d1280-melee-1fight.png`, `.scratch/r88/p390-3v3-1fight.png`, `.scratch/r88/d1280-3v3-1fight.png`.
Fix: confirm Strike 1/2 map to Blast/Flame (or Ice Shock) and say so in Help; add a test that every key-bound ability is reachable by touch.

### P2. Sky void above the crowd at 390x844 (carries r85 P6, r86 P4, r87 P2)
Between the HUD (y about 150) and the horizon the canvas is a flat gradient: about 215 CSS px for Curomo, about 300 CSS px for the ranged hero in the Fire arena, where the single-row bar gives the arena more height and the void grows with it. Fighters are about 55px wide at the left and right edges (Sindarosa is clipped at x=15 in 3v3). 360x640 has no void.
Shots: `.scratch/r88/p390-ranged-1fight.png`, `.scratch/r88/p390-melee-1fight.png`.
Fix: zoom the arena camera to the tall canvas, or give the sky a backdrop layer; fighters should be larger in portrait.

### P3. Portrait HUD text is inconsistent
At 390 the player text reads "SINDAROSA ▲ 286/286 0%" for the ranged hero (no SUPER word) but "CUROMO ● 542 SUPER 0%" for Curomo (no max life); the foe reads "ROKCORE ■ 321" (no max, no "Life"). Desktop reads "Life 542/542" and "SUPER 0%" consistently. A 0% with no label next to a life number could be taken for a life percentage.
Shots: `.scratch/r88/p390-ranged-1fight.png`, `.scratch/r88/p390-melee-1fight.png`, `.scratch/r88/p360-melee-1fight.png`.
Fix: always render "SUPER n%" and show current/max (or current only for all) in portrait.

### P4. Ranged bar tiles are 48x92 and 45x89 (tall, narrow)
The one-row bar is half again as tall as it is wide, so the tap area is generous but the icons sit in the upper half with the label under. Not a bug; the 360 tile width (45px) is the smallest touch width seen. Melee tiles are 64x64 and use 128px of height, so the melee arena is about 90px shorter than the ranged one at 390.
Shots: `.scratch/r88/p360-ranged-1fight.png`.

### P5. Key hint "2 C" on the Snag tile
The Snag tile shows "2 C" in the corner (touch players see a keyboard hint; desktop shows the same). It is the only two-part hint and reads as a typo on a phone. Shot: `.scratch/r88/p390-melee-1fight.png`.
Fix: hide key hints on touch layouts or show only "2".

### P6. Not checked this round
Tapping tiles and Strike circles to fire, Super cut-in, Tour, landscape, long-fight states (tiles during cooldown or STUN), e2e run.

## Passed

- Touch targets: tiles at least 45px, Strike circles about 64px and apart from the stick, Pause and fullscreen at least 44px and under the strip.
- 5+4 and 5+5 rows centred at both portrait sizes; bar lowest edge on the canvas bottom.
- Desktop bars one row with all tiles, readable labels.

## Triage 2026-11-21 (code-checked)

Fixed: P3 portrait HUD text (verified r89). Dropped (phone/portrait/touch): P1, P2, P4, P5, P6 (touch tiles, key hints, sky void).
Open: none.
