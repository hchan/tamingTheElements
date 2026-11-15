---
status: idea
added: 2026-11-15
---

# QA r55 findings (HEAD 31bc0882)

Screenshots in `~/claudetmp/qa-r55/s/`, scripts in `~/claudetmp/qa-r55/*.mjs`. Scorecard: qa-r55-scorecard.md. No commits on main since r54, so all r54 items are carried over unchanged.

## Fixed since r54

None (no new code on main).

## Still open (from r54)

1. Phone portrait in-match (r54 new #2) is unchanged (`pport-match.png`, `pport-super.png`): a ~390x230 arena strip floating in black, two-row action bar overlapping the arena, huge FIRST BLOOD card, and the super banner (PHOENIX RISE) hidden behind the action bar. Suggest: in portrait scale the arena to the full width and use the black space, one scrollable action-bar row, small first-run card, banner above the bar.
2. First-run FIRST BLOOD card still overlays the lower arena on desktop (`st-Fire-hit.png`, `st-Air-hit.png`). Suggest auto-dismiss on first input or first hit.
3. 2v2 picker (`team2-picker.png`, 1280x720): the partner slot ("Pax") is half hidden behind the Fight bar and the roster is cut off; only the "More heroes below" pill mitigates it. Suggest a sticky partner row above the Fight bar.
4. Wispera's dithered halo (`st-Fire-hit.png`) and grey contour noise around the left dark silhouette on the menu (`menu-desk-late.png`) remain.
5. CC has chips but no body feedback (frost tint, stars, prone pose, locked slots); per-status chip accents plus a darker plate are still wanted. A real-match deterministic e2e per rider is still missing.
6. Tour stage 9 script error after the forced KO is the harness (undefined arena handle), not a game error.

## New observations

1. Tour card (`tour-card9.png`): clear and good. Stage list with CLEARED and NEXT tags, continues dots, team portraits and the Void opponent read well. Tour fight 9 (`tour-fight9.png`) is a legible Void arena. Minor: the second TAG slot beside the bench portraits looks like an empty orange stub. Suggest a clearer "ready" fill.
2. Tour fight 8 and 2v2 (`tour-fight8.png`): the tag portraits sit in the crowd band under the HUD with low contrast; WATER +HP pickup labels repeat three times at the same size and compete with the fighters. Suggest dimming repeated pickup labels beyond the nearest.
3. Air 1v1 (`st-Air-hit.png`): the scripted strike did not connect (no hit spark), the only stage where the hit shot is empty. Probably placement, not a bug, but worth a scripted check that Air reach matches the other stages.
4. Menu (`menu-desk-late.png`, `menu-pl.png`): five entries, clean. At 667x375 the title overlaps the Echo silhouette and the buttons crowd the dragon art. Suggest a smaller title on short viewports.

## Coverage

Menu (desktop, phone landscape), 1v1 in Fire, Water, Earth, Air (intro, start, hit, super), 2v2 picker and tag swap, Tour cards 1-9 and fights, Help, Settings, Play, Online pages, phone landscape and portrait in-match. Not judgeable from stills: motion feel, hit-stop, audio.
