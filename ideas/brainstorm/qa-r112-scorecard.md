---
status: idea
added: 2026-11-18
---

# QA r112 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), dev server on main 25811ea0, screenshots in `.scratch/r112/` (prefix d = 1280x720, p = 390x844, s = 360x640, l = 844x390). Script: `.scratch/r112/qa.mjs`.

| Axis | Desktop 1280x720 | Phone landscape 844x390 | Phone portrait 390x844 / 360x640 |
|---|---|---|---|
| Fun | 3.5 | 3.5 | 2.5 |
| Graphics | 4 | 4 | 3.5 |
| Readability | 3.5 | 3.5 | 2.5 |

- Menu: portrait menu is now clean at both sizes (`p-menu.png`, `s-menu.png`): label above subtitle, all five entries on screen, no clipping.
- Match-end card: fits the viewport at all four sizes (win card; measured buttons all above the fold). The suspected phone overflow did not reproduce. See findings for a 2 px desktop overshoot.
- Portrait fight: the arena is a thin band in the lower third with a large empty sky above; heroes are about 100 px, HUD text is small (`p-fight.png`).
- Landscape (844x390) is the best phone layout: Tour plate, tiles, stick, Strike buttons and the match-end card all clear of each other.

Fixed since r111: portrait menu (`portrait-menu`), Tour plate on landscape stays clear of tiles, touch Run tile on-state now confirmed with a real touch (`l-run-1.png`, gold outline, "Run Away on"), weather plates vs status chips (`callout-overlap`; no overlap seen in `d-fight2.png`, `l-2v2.png`). Stun Run refusal note is not visually checked this round (unit-covered only).
