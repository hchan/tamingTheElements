---
status: done
triaged: superseded (art items noted, rest fixed or dropped)
added: 2026-11-16
---

# QA r75: findings (main cfbdd865)

Screenshots in ~/claudetmp/qa-r75/. Re-check of the qa-r74 list.

| r74 item | r75 result | Evidence |
|---|---|---|
| Hint card vs super band at 844x390 | STILL OVERLAPS. The "Stick moves you" card sits on the left of the band, band lines run through it; the title itself is not covered at 844, but at 667 the card touches the "HAILSTORM" title | sup-p844-morblass-near-3.png, sup-p667-morblass-near-3.png |
| Pause button vs band end | FIXED. Pause and Strike buttons sit in a right gutter, outside the band | same two shots, sup-p844-echo-near-4.png |
| Air super title fade / rim | OK. "EYE OF THE STORM" keeps its dark rim and stays readable as the band fades; the band itself goes pale but is not a problem | sup-d1280-cyclonius-near-2.png, -near-3.png |
| 667x375 gutter and hint fade | Gutter OK. Hint card still shown at the super moment (not faded) | sup-p667-*.png |
| SNAG label behind chips | STILL THERE. Floating "SNAG" half hidden behind the "SNAGGED 1s / STUN" chips | f-morblass-wispera-fight.png |
| Damage-number collisions | STILL THERE. "72" with "16" and "0" jammed together; "43 9 88" cluster | p-rokcore-cyclonius-5.png, s-cyclonius-echo-40.png |
| KO entrance ghosting | STILL THERE. Fallen hero still drawn under the incoming Pax | k-1280-ko-1.png |
| Far floor chip fade | PARTLY. Many far chips are solid now (tour-2.png, sup-d1280-*), but a faint "WATER +HP" at about 30% alpha remains at the far side, and one chip text sits behind a hero sprite | p-ishimi-fiara-3.png, tour-2.png |

## New / still open

1. Hint card is the one remaining phone overlap; park it below the band, or hide it while a super band is up.
2. Wispera is still a plain orb; Echo and Cyclonius icons are still similar (r73/r74).
3. Portrait: menu is shown correctly now (m-port-menu.png); in-fight portrait not re-verified.
4. Menu, Help (844x390 usable), Settings, Versus, 2v2 pick, Tour all load without console errors (all script runs printed an empty error list).

## Verification

Playwright dev-build runs printed no console errors. e2e subset (first-run-hint, arcade-super, arcade-tag): 19 passed. Note the e2e "hint is gone the moment a super cut-in starts" passes, yet the screenshots (manual-step harness, hint card not yet dismissed or faded) still show the card across the band, so the test does not cover the 844x390 and 667x375 geometry or the manual-step path.

## Triage 2026-11-21 (code-checked)

Fixed: hint card over the super band (`ideas/done/hint-card-waits-for-super-band.md`, verified r77); Pause gutter; KO ghost (r76); SNAG behind chips (r77); damage-number collisions (r78); far chip fade (FLOOR-TAGS-1, `src/game/fx/terrain-view.ts:248`). Dropped (phone/portrait): item 3 (in-fight portrait). Art only, noted: Wispera orb, Echo/Cyclonius icons (`ideas/brainstorm/qa-r127-tour-foe-scale-wispera.md`).
Open: none.
