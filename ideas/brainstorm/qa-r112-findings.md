---
status: idea
added: 2026-11-18
---

# QA r112 findings

Ranked. Shots under `.scratch/r112/`. No console errors in any of the four viewport runs.

## Blocker

none

## Major

none

## Minor

1. Portrait fight wastes the screen: the playfield is a ~15% band above the action bar, the rest is empty sky, so heroes are about 100 px tall and the top HUD text (names, SUPER %) is about 10 px. Shots: `p-fight.png`, `s-fight.png`, `p-2v2.png`.
2. Landscape Run tile note is clipped while running: "Run Away on" is cut at the tile edge (`l-run-1.png`). Tile on-state itself works (real CDP touch: label "Run Away, ready" -> "Run Away, on", gold outline).
3. Landscape: a "FIRE x2"/"AIR x2" terrain plate can sit on top of the stick ring or at the screen edge (`l-tour-fight.png`, `l-run-1.png`: plate at bottom-left over the stick). Same plates repeat 4 to 6 times; noisy at phone size.
4. Desktop match-end card is 2 px taller than the viewport (card 8..722 in a 720 viewport, `d-match-end.png`); buttons are fully visible (bottom 715), so this is cosmetic, but there is no breathing room under "Change fighters" / "Main Menu".
5. Run tile stays "on" for at least 44 ticks after release in the Tour fight (`d-run-2.png`, `l-run-2.png`); check that this matches the intended duration.

## Nit

6. Landscape match-end: "Change fighters" wraps to two lines while "Main Menu" is one (`l-match-end.png`); the Pax tile is also small next to Sindarosa.
7. Portrait Tour plate ("Stage 1 of 9 / 3 continues left") is large next to the HUD and crowds the Pause button (`p-tour-fight.png`).
8. Action bar is still 12 tiles; on 360x640 the first row is cut to Melee..Run Away with Strike buttons standing in for Blast and Flame (works, but unlabelled by number).

## Not covered

Defeat card, stun Run refusal note and status chips were not forced this round; the `match-end.spec.ts` and `arcade-weather.spec.ts` specs cover them. No e2e was run.
