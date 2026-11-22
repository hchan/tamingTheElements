---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r95 findings (main 5d3b0227)

Scores are in [qa-r95-scorecard.md](qa-r95-scorecard.md). No code changed. Screenshots under `.scratch/shots/` (gitignored, in the QA worktree). Setup: Versus, pick the stage radio (Fire, Water, Air, Earth), Fight!, tap "Play anyway in portrait", step 95 ticks, at 390x844 and 360x640 (isMobile, touch). 8 stage runs plus a live Earth 1v1; no console or page errors.

## Ranked findings

P1. Portrait sky band shows Fire (lava) art above the fighters on EVERY stage. In all eight shots the top part of the sky (from just under the HUD to about a third down, ~y 150-545 device px at 390; ~y 150-200 at 360) is the same dark lava-crack texture with orange cracks, whatever the stage, and it ends in a hard horizontal edge where the element haze starts (`m390-fight-Water.png`, `m390-fight-Air.png`, `m390-fight-Earth.png`, `m360-fight-Water.png`, `m360-fight-Air-b.png`). On Water/Air/Earth the colours clash (brown-black lava over teal, violet or olive). Looks like a stage-independent texture (page/menu backdrop or a stale layer) showing through where the new mirrored tiles and gradient do not cover; the fade overlay is only 2 logical heights tall and the mirrored tile is meant to cover the rest. Repro: Versus, pick Water, Fight!, Play anyway in portrait at 390x844; compare top third of the canvas with Fire.

P2. The mirrored stage art is not recognisable. Between the crowd line and the lava band the sky is a smooth fog gradient; there is no readable mirrored arena (no flipped crowd, banners or floor), so the change looks like a darker gradient, not "stage art continued upward". Fire (`m390-fight-Fire.png`) is closest (faint volcano/ember haze), Earth shows a flat mid-grey-olive gradient (`m390-live-2.png`). Same repro as P1.

P2. Visible seams in the band: a horizontal step in brightness where the crowd backdrop ends and the haze begins (y ~765 at 390 in Water/Air, y ~405 at 360 in Water), plus the hard lava edge from P1. After the camera pans in a live match the haze band and the crowd shift but the lava band stays put (`m390-live-2.png`, `m390-live-4.png`).

P2. Live portrait: dark brown band below the floor, between the arena and the action bar/touch area, appears once the camera frames the fight (`m390-live-4.png`, y ~1315-1360). Repro: live Earth 1v1 at 390x844, wait for ROUND 1 LOST.

P3. KO banner crowds the HUD: "ROUND 1 LOST" card sits on the "ROUNDS 0-1" line and the "WEATHER 12%" label, so both are half hidden (`m390-live-4.png`).

P3. Versus Options strip at 390 (carried from r94): still two lines, a plain box with no `aria-expanded` (null) and no state change after the jump (`m390-versus.png`; button, 67 px high, text "Options: Computer, 1v1, Normal, Random ▾").

P3. Play pick at 390 (carried): lead tile "Sindarosa" touches the tile border; remove X buttons overlap the top-right of each tile's art; "More below" chip overlaps the Fire row (`m390-play.png`).

P3. First-run "FIRST BLOOD" card over the sky at 360 still covers the sky and part of the haze (`m360-fight-Air-b.png`); carried.

P3. Carried, unchanged: rotate overlay on first portrait entry needs "Play anyway"; super cut-in is a banner; match-end layout shared by win and loss.

## What worked

Haze and gradient joins below the crowd are smooth in all four elements (no seam at the arena top edge), the stage tint carries up (teal, violet, olive, orange), and the HUD stays readable on top. Live 1v1: Strike 1/2, stun, Rockfall and weather chips are legible at 390; no errors across the run.

Not done: the root cause was not confirmed in code (QA only); P1's "stage-independent texture" is a hypothesis from the screenshots. Desktop 1280 was not re-shot (change is portrait-only).

## Triage 2026-11-21 (code-checked)

Dropped (phone/portrait): every item is portrait-only (sky band with Fire art, mirrored art, seams, band under floor, KO banner, Options strip, Play pick). P1 verified fixed in r96, seams in r97, band under floor in r99.
Open: none.
