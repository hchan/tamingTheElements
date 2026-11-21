# QA r114 findings (ranked)

status: done
triaged: d/a (items 1-3, 6-8 are phone/portrait/touch, dropped 2026-11-18; 4 Run note is 12 px Phaser text, src/game/hud/action-bar-view.ts:479; 5 terrain chip registers in HUD_AVOID_KEY, src/game/fx/terrain-view.ts:3,420; 9 probe reports chipAlpha, terrain-view.ts:516,584; 10 match-end hook exists via arena.setHp/step, tests/e2e/match-end.spec.ts:17)

Build: main at 46992a0d (swap-allowed merge). Headless Playwright (SwiftShader), viewports 1280x720, 844x390, 390x844, 360x640. Screenshots under `.scratch/qa-r114/`.

## 1. Portrait fight: fighters bigger, but still small with a big empty sky
status: idea
added: 2026-11-18
severity: high

Fighters are about 1.4x bigger than r113, but 35-40% of the portrait screen above the arena is still empty sky, and the fighters stay small relative to the screen. The framing work did not use the spare vertical space.
Screenshots: `.scratch/qa-r114/p390-2v2-b-iced.png`, `.scratch/qa-r114/p360-1v1-b-fight.png`
Corroborated by the smoke run: `portrait-play.spec.ts:118` (360x640) fails with `camZoom` 0.952, expected >= 1.05 (`.scratch/smoke.log`).
Idea: zoom the camera on the fighters in portrait (frame to the fighter pair, not the arena width), and shift the arena up into the sky area.

## 2. Hero names truncate at 360 wide and in 390 2v2
status: idea
added: 2026-11-18
severity: medium

Names are cut off on both sides at 360x640, and in the 390x844 2v2 layout. This is r113 finding 3, still not fixed.
Screenshots: `.scratch/qa-r114/p360-1v1-b-fight.png`, `.scratch/qa-r114/p390-2v2-b-fight.png`
Idea: shrink-to-fit or abbreviate names, or let the name chip wrap to two lines.

## 3. Portrait ability tiles are under the 44 px target
status: idea
added: 2026-11-18
severity: medium

Tiles measure 43x87 at 390 and 40x84 at 360 (1v1 bar). The 2v2 bar wraps into two rows with 44+ px tiles, which is fine.
Screenshots: `.scratch/qa-r114/p390-1v1-b-fight.png`, `.scratch/qa-r114/p360-1v1-b-fight.png`
Idea: set a min-width of 44 px and let the bar wrap or scroll, as 2v2 already does.

## 4. "Can't run: stunned" Run note is tiny and dim
status: idea
added: 2026-11-18
severity: low

The new Run box note renders at about 8 px and low contrast, so a player is unlikely to read it mid-fight. The STUN state on the Tag tile works and is clear.
Screenshots: `.scratch/qa-r114/desk-run-note-crop.png`, `.scratch/qa-r114/desk-live-final.png`
Idea: raise the note to at least 10 px with full-contrast text, or show it as a tooltip chip above the tile.

## 5. FIRE x2 terrain badge overlaps the NO SNAG status chip
status: idea
added: 2026-11-18
severity: low

The terrain plate chip sits on top of the NO SNAG chip and clips it.
Screenshots: `.scratch/qa-r114/desk-live-final.png`
Idea: stack the chips in one flex row, or move the terrain chip to the other corner.

## 6. Tiny HUD labels in portrait and landscape phone
status: idea
added: 2026-11-18
severity: low

WINS labels measure about 6.2-6.7 px in portrait. TAG and SUPER labels are about 8-10 px on the landscape phone.
Screenshots: `.scratch/qa-r114/p360-1v1-b-fight.png`, `.scratch/qa-r114/land-2v2-b-fight.png`
Idea: set a 10 px floor for HUD text.

## 7. Landscape phone: Pause and Strike buttons sit outside the canvas, Strike circles small
status: idea
added: 2026-11-18
severity: low

At 844x390 the buttons are in the black bar beside the canvas, and the Strike circles are small for thumbs.
Screenshots: `.scratch/qa-r114/land-2v2-b-fight.png`, `.scratch/qa-r114/land-1v1-b-fight.png`
Idea: grow the circles to 56 px or more, and use the side bars as the thumb zones.

## 8. Rotate overlay shows first in portrait, first-run card covers the sky
status: idea
added: 2026-11-18
severity: low

A new portrait player must dismiss "Play anyway in portrait" and then "Got it" before seeing the fight.
Screenshots: `.scratch/qa-r114/p390-2v2-intro.png`, `.scratch/qa-r114/p390-2v2-before.png`
Idea: remember the choice, or merge the two prompts.

## 9. Terrain chips all read "FIRE x2"; probe reports chip alpha 0
status: idea
added: 2026-11-18
severity: low

The word chips are repetitive across plates (one word per kind, so every plate in a fire arena says FIRE x2). `arena.terrain()` reports chip alpha 0 although they render, so a test on it would mislead.
Screenshots: `.scratch/qa-r114/desk-2v2-b-fight.png`
Idea: show the chip once per kind, or on first contact only, and make the probe report the real alpha.

## 10. Match end, super and tag-swap screens not captured
status: idea
added: 2026-11-18
severity: low

Manual-stepped fights stay idle, and a 150 s live run did not reach match end, so these screens were not reviewed this round. Not a game bug, a QA gap.
Idea: add a test hook that forces a round or match end so QA can screenshot it.
