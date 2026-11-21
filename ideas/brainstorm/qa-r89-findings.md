---
status: idea
triaged: c (P3 long-fight damage numbers and combo digits swamp fighters)
added: 2026-11-16
---

# QA r89 findings

Round r89 on main 4dbe7bfe. Headless Chromium, seed 7, shots in `.scratch/r89/` (gitignored). No code changed. Covered 390x844, 360x640 and 1280x720 with Curomo (melee), Sindarosa (ranged) and Pax vs Fiara (start only); menu, Help, Versus picker, Strike and tile taps, Super cut-in, a long fight. No console or page errors. Not covered: landscape 844x390, Tour, Online, a full round to the end screen, e2e run.

## r88 fixes verified

- P3 (HUD text): the portrait HUD now reads "CUROMO ● 542 SUPER 0%" and "ROKCORE ■ 321 SUPER 0%", and "SINDAR… ▲ 286 SUPER 0%" for the ranged hero: current life only, a named SUPER label on both sides, same for melee and ranged at 390 and 360. Desktop keeps "Life 542/542". After damage the portrait life updates ("● 356", "▲ 203").
  Shots: `.scratch/r89/p390-curomo-1start.png`, `.scratch/r89/p360-sindarosa-1start.png`, `.scratch/r89/p390-curomo-3long.png`.
- P3 (Help links): the compact page-link buttons are 44px tall, 2 rows at 390 (y=198, 254) and 3 rows at 360 (y=198, 254, 310). No horizontal overflow. Shot: `.scratch/r89/p360-help-top.png`.

## Ranked findings

### P1. Hero name truncated in the portrait HUD ("SINDA…", "SINDAR…")
The shorter life text did not free enough room: Sindarosa reads "SINDAR…" at full life and "SINDA…" once the life number changes (hudTextSizes). The label is the only way to tell heroes apart in a 3v3 or when both sides pick the same element, and the name flickers in length with damage. Curomo, Pax, Fiara and Rokcore fit.
Shots: `.scratch/r89/p360-sindarosa-1start.png`, `.scratch/r89/p390-sindarosa-1start.png`.
Fix: reserve the name width (or drop the element glyph) so the longest hero name always fits at 360; test with Sindarosa and Cyclonius.

### P2. Versus picker at 360x640: sticky footer takes 41% of the screen and the options are far below
The Fight!/Back footer is a fixed block about 265 CSS px tall (Fight! y=516, Back y=576), leaving about 375px of scrolling area, shared with the header and the P1/AI cards. The Computer / Two players, 1v1 / 2v2 / 3v3, difficulty and arena options are at y=1068 to 1533 in page coordinates, below all four hero rows; a player who taps Fight! first never sees them, and the footer hides a hero row partly under "More below". Back is 92x44, Fight! 192x48 (fine).
Shot: `.scratch/r89/p360-versus.png`.
Fix: make Back and Fight! one row, or let the footer shrink to about 100px at heights under 700; move mode and difficulty above the hero grid.

### P3. Long fight: damage numbers and combo digits swamp the fighters
After about 1500 ticks the arena shows a pile of small "16/14/13" numbers plus 100+px combo digits ("14308 72 72", "136 48") over both fighters; at 390 the hero is hidden behind a number for several frames. Also the burst of mixed-size numbers is hard to read as one hit. Not an error, a readability issue that portrait amplifies (the arena is narrow).
Shots: `.scratch/r89/p390-curomo-3long.png`, `.scratch/r89/p390-curomo-8supercut.png`.
Fix: cap the number count per fighter, merge hits within a few ticks, and keep big numbers above the head.

### P4. Fighter pinned at the arena edge in a long fight
Curomo ended at x=13 (left wall) at both portrait sizes after being hit; half of the sprite is behind the edge of the view and the Super cut-in portrait is clipped at x=0. Shot: `.scratch/r89/p390-curomo-3long.png`.

### P5. Help link text is top-aligned inside the buttons
At 360 "Key Bindings", "Guide", "Wiki", "About" sit at the top of 44px boxes with empty space below, so the buttons look unfinished; "Jump to" chips are centred. Shot: `.scratch/r89/p360-help-top.png`. Fix: centre the label vertically (flex, align-items center).

### P6. Snag tile text is empty in the DOM
The Snag tile's `.touchSkirt` has empty textContent (the other tiles carry key, name and state), so a screen reader or test cannot tell it from a blank tile; the visible label is drawn on the canvas. Same for the first tile of the ranged bar ("Melee"). Evidence: tile list in `.scratch/r89/play.mjs` output. Fix: add an aria-label to every tile.

### P7. Sky void persists at 390x844 (carries r88 P2)
Between the HUD and the horizon about 215 CSS px stay a flat gradient, partly covered by the first-run card; the cut-in band fills some of it. Shots: `.scratch/r89/p390-curomo-6strike1.png`.

## Passed

- Menu: Play, Versus, Online, Settings, Help; 57px tall at 390, 50px at 360, 58px at 1280; no horizontal overflow; no banned words.
- Strike 2 and every bar tile fire when held across a tick; Super cut-in plays for Curomo (GLACIER CRASH) and Sindarosa (HELLFIRE LANCE) at 390 and 360, band under the HUD and above the bar.
- Touch targets at least 45px (Strike circles about 64px, Pause 44px+).

## Triage 2026-11-21 (code-checked)

Fixed: r88 P3 HUD text, Help link sizes. Dropped (phone/portrait/touch): P1 name truncation, P2 Versus footer, P4 edge pin, P5 Help link alignment, P6 tile aria-labels, P7 sky void.
Open (low): P3 damage numbers pile up in a long fight; `src/game/hud/arcade-hud.ts` pools 16 slots with a fan-out but does not merge hits within a few ticks, so the desktop readability issue may remain (no screenshot check made).
