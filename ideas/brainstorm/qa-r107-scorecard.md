---
status: idea
added: 2026-11-17
---

# QA r107 scorecard

Headless Chromium (SwiftShader), test build on a private port, `?manual=1&seed=7`. Viewports: portrait 390x844, landscape 844x390, landscape 667x375, desktop 1920x1080. Every screenshot was viewed (`.scratch/shots107/`, not committed). No console or page errors in any scripted run.

Scores are 1-5.

| Area | Score | Evidence |
| --- | --- | --- |
| Fun | 4 | Super at later frames (Fiara, frame 45 landscape and frame 25 desktop) reads well: multi-hit burst, "3 HITS 128 DMG" combo counter, big damage number, STUN status chip, "FIRE x2" bomb tags. Tour pick screen is clear (three slots, element groups, Slot n badges). Landscape strike circles now say what they do. |
| Graphics | 4 | Arena art and per-element floors are strong at all landscape sizes (lava, ice, earth, air each distinct). Super burst and bomb traps look good. Minus: portrait arena shrinks the fighters to about 60 px in a mostly empty sky (see P2 in findings); desktop match-end panel has a visible hard edge. |
| Readability | 3 | Landscape HUD is readable and the match-end card fits (fixed). Minus: Strike label mismatch for Snag heroes, inconsistent "Life" prefix between the two HUD sides, portrait HUD shows only current life, button text wrapping on the 667x375 card. |

## Verified fixed (since r106)

- Landscape match-end card (r106 P2): the two-column Defeat card fits at 844x390 and 667x375, with Rematch, Change and menu buttons all inside the viewport (measured with getBoundingClientRect, docH not larger than the viewport).
- Victory and Draw cards now checked too (r106 only reached Defeat): all three fit at both landscape sizes, and the portrait and desktop cards have no regression.
- Landscape strike circles show the ability name under the number (Strike 1 / Strike 2 plus name) for Fiara, Treenoc, Curomo, Ishimi, Rokcore, Lavax, Cyclonius, Morblass and Echo, and the names match the bar for all except the Snag cases in the findings.
- Landscape HUD shows `NAME current/max` for the player side at 844x390 and 667x375.
- Super band at later frames (3, 12, 25, 45, 70, 100) at all four viewports: no clipping, no leftover overlay.

## Not covered

- Tour beyond the pick screen: the map, stage splash and in-run HUD were not reached (only the pick screen at portrait and landscape was captured).
- Real touch gestures (swipe or hold on the stick); only static captures and sim stepping.
- Online and Versus flows.
- Audio.
- Safe-area insets on notched devices (no emulation of env(safe-area-inset-*)).
- Foe-side hero variety (the foe was Pax, or Treenoc in portrait and desktop).
