---
status: done
triaged: superseded (art items noted, rest fixed or dropped)
added: 2026-11-16
---

# QA r76: findings (main e6a731ef)

Screenshots in ~/claudetmp/qa-r76/. Re-check of the qa-r75 list. No console errors in any script run (menu, fight x9 pairings, KO/tag at 3 sizes, 2v2, Tour, supers in 4 stages and 2 phone sizes, portrait).

| r75 item | r76 result | Evidence |
|---|---|---|
| KO ghost removed at tag-in | FIXED. After the active hero is KO'd the incoming Pax shows alone with "PAX IN!"; no fallen sprite under it at 1280 or 667 | k-1280-ko-1.png, k-1280-ko-8.png, k-667-ko-1.png |
| Far floor chip fade | MOSTLY FIXED. Far chips are solid or about 60%; one "WATER +HP" chip still renders at about 30% alpha when it sits under/behind a hero sprite | tour-2.png (chip under Morblass), p-ishimi-fiara-3.png (dim chip at lower left, others solid) |
| Hint card vs super band, phone | STILL OVERLAPS. At 844x390 the "Stick moves you" card sits over the band's left side; at 667x375 it touches the "HAILSTORM" title. Phone "Got it" card is not suppressed while the band plays in the manual-step harness | sup-p844-morblass-near-3.png, sup-p667-morblass-near-3.png, sup-p844-echo-near-3.png |
| SNAG label behind chips | STILL THERE. "SNAG" peeks out under the "SNAGGED 1s / STUN" chips | f-morblass-wispera-fight.png |
| Damage-number collisions | STILL OPEN (not new). "72" with "16" and "0" overlapping | p-rokcore-cyclonius-5.png |
| Air super title | OK. "EYE OF THE STORM" legible with the dark rim; desktop first-blood hint sits clear below | sup-desk-cyclonius-near-2.png |
| Pause/Strike gutter | OK at 844 and 667 | same phone shots |

## Other

1. Menu, Help, Settings, Versus, 2v2 pick, Tour and portrait menu all render (m-*.png, port-*.png, tour-*.png, tag-*.png).
2. Wispera is still an orb; Echo and Cyclonius icons still similar.
3. In-fight portrait is only screenshotted at start (port-arena0/1.png), not through a super.
4. Prior-note caveat holds: the e2e "hint gone when super starts" passes but does not cover the manual-step phone geometry shown above.

## Triage 2026-11-21 (code-checked)

Fixed: KO ghost; far chip (FLOOR-TAGS-1, `src/game/fx/terrain-view.ts:248`); hint card vs band on phones (r77 HINT-CUT-1); SNAG behind chips (r77); damage-number collisions (r78). Dropped (phone/portrait): item 3 and the phone hint geometry caveat. Art only, noted: Wispera orb, Echo/Cyclonius icons.
Open: none.
