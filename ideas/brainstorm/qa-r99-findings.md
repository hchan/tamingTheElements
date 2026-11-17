---
status: idea
added: 2026-11-17
---

# QA round 99 findings

Screenshot paths are relative to the worktree `.scratch/shots99/` (gitignored). Ranked by player impact.

## P1

None.

## P2

1. Portrait 390x844 still has a large empty sky band (roughly 35-45% of the play area) above the crowd and horizon on Water and Fire stages, and the fighters are small and pushed to the screen edges. The r98 camera zoom cap helped but the fight does not yet fill the tall view. Evidence: `.scratch/shots99/m390-fight-water.png`, `m390-fight-fire.png`, `390-after.png`, `m390-fight-earth-later.png`. Idea: shift the camera anchor up or lower the horizon so the floor takes more of the view.
2. The two-row ability bar (Water, Air, and 2v2 heroes) covers the lower floor on phone, so the bottom fighter and ground shadows sit under it. Evidence: `m390-fight-water.png`, `m390-2v2.png`, `m360-super-water.png`. Idea: shrink slots on the second row or cap the floor reserve by row count.

## P3

1. Match-end win card at 360x640 breaks the hero name mid-word ("SINDAROS / A (FIRE)"). Evidence: `match-end-win-360.png`. Idea: allow the name to shrink or wrap at spaces only.
2. Match-end lose card at 390: the two hero tiles are vertically misaligned (winner tile higher). At 360 the Main Menu button sits very near the bottom edge. Evidence: `match-end-lose-390.png`, `match-end-win-360.png`.
3. In 2v2 on phone, bench portraits abut or overlap the SAFE chip at the left of the HUD. Evidence: `tour-after.png`, `m360-2v2-tag-a.png`.
4. Tag tooltip ("Tag / Swap in a team-mate...") sits over the lower-left floor in the 2v2 shot at 360 and covers the fighter's ground area. Evidence: `m360-2v2-tag-a.png`. May be hover state left by the test click; check on real touch.
5. First-run hint card covers the ROUND 1 banner when the hold is forced; likely by design. Evidence: `hint-*.png`.

## Verified fixed from prior round

- Round-end banner and result card: bold and legible at phone sizes.
- Terrain chips hidden during super cut-in; SAFE chip no collision with the band (390 and 360).
- Floor band behind the action bar: no sky hairline.
- Tour card on phone: scannable, no clipping (`m390-tour-stage.png`, `tour-after.png`).
- Portrait camera is closer than r98 (partial, see P2 1).

## Tests

Playwright Chromium (SwiftShader), E2E_PORT=7949: 57 of 57 passed in 7.3 min (portrait-play, super-band-portrait 390 and 360, round-end-panel, round-result-real-fight, tour-card, versus-portrait-grid, match-end and related specs). A custom screenshot flow (menu, help, picker, 4 stages, supers, 2v2 plus tag, Tour at 390, 360, 1280) finished with 0 console or page errors. The full e2e suite was not run.
