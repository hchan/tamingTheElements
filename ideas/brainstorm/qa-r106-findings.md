---
status: idea
added: 2026-11-17
---

# QA r106 findings

Build: main at 59459364, test mode, headless Chromium (SwiftShader), device scale 2 on phones. Shots in `.scratch/shots106/` of the r106 QA worktree (gitignored): `fight-{port|land|land2|desk}-{a|b}`, `super-*`, `2v2-*`, `picker-*`, `matchend-lose-{port|land|desk}`, `matchendL-scrolled-{land|land2}`.
No console or page errors in the scripted runs.

## Verified fixed since r105

- Landscape HUD life reads current/max (r105 P2 3).
- Landscape Strike circles name their ability (r105 P3 4).
- Defeat card reachable and fine at portrait 390x844 and desktop 1920x1080 (names, "Rounds 0-2", three buttons visible).

## P2

1. Defeat card overflows landscape phones. At 844x390 the card content is 663 px tall (buttons end at y 665; viewport 390); at 667x375 it is 654 px (buttons end at y 656). `#arcadeResults` does not scroll itself; the page (HTML element, overflow auto) scrolls, and after scrolling to the bottom Rematch, Change fighters and Main Menu are reachable (`matchendL-scrolled-land.png`) but the heading and names scroll off the top. Players see the hero names and DEFEAT but no buttons until they scroll. Repro: `?manual=1&ff=arcade#arcade`, phone emulation 844x390, force two KOs of the player, view `#arcadeResults`. Fix: in landscape (`max-height: 480px` and `orientation: landscape`) lay the card out as two columns (portraits left, result and buttons right) or shrink portraits; add a landscape-phone size to `tests/e2e/match-end.spec.ts` (its SIZES are 1280x720, 390x844, 360x640 only) asserting buttons end inside the viewport.
2. Portrait 390x844 arena is mostly sky and fighters are small (`fight-port-b.png`). Open since r101. Fix: cap sky height or zoom the camera on tall aspect ratios (`src/game/scenes/Arena.ts` camera fit).
3. Portrait 2v2: bench thumbnails and TAG labels crowd under the HUD and the action bar is two rows (`2v2-port-a.png`). Open since r103. Fix: keep the Tag slot beside the Strike buttons so the bar stays one row.

## P3

4. Portrait HUD life may still be a bare number in the compact layout (`2v2-port-a.png`); desktop and landscape now show current/max. Make portrait consistent or document it.
5. Hazard chips ("FIRE x2") sit in open floor and add clutter, especially with the first-run card on desktop (`2v2-desk-b.png`). Fix: shrink them or anchor them to the zone edge.
6. Portrait first load shows a "Rotate your device to landscape... Play anyway" overlay that hides the arena until tapped. Intended, but the portrait layout is otherwise supported; consider removing the nag if portrait is a target.
7. Desktop first-run card ("FIRST BLOOD ... Got it") stays over the lower floor until dismissed (`2v2-desk-b.png`).

## Not covered (follow up)

- Victory card at any size (forced KO path did not reach it; the e2e win test covers it at 3 sizes, none landscape phone).
- Draw card, local two-player card, Tour, real Online, hero-by-hero Strike labels, a later-frame super band sample at landscape.
