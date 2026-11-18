---
status: idea
added: 2026-11-17
---

# QA r104 findings

Build: main at ce818a5d, test mode, headless Chromium (SwiftShader), device scale 2 on phones. Shots in `.scratch/shots104/` of the r104 QA worktree (gitignored), named `{scene}-{desk|land|port}.png`.
No console or page errors. E2E subset 40 of 40 passed.

## Verified fixed since r103

- Versus bar at 390x844: 73.6 px tall, "Play online" on one line next to Fight! and Back (`picker-port.png`); versus-layout passes at all sizes.
- HUD life format: both fighters show the same format (`fight-Fire-b-land.png`: 286 and 321; desktop "Life 286/286" and "Life 321/321").
- Portrait sky: cropped (`fight-Fire-b-port.png`), but see P2 item 1.
- Online failure: single message, Host/Join, one Try again, readable at 390 (`online-fail-port.png`).

## P2

1. Portrait arena now has a large empty floor-texture band (about 30% of height, y 930-1170 of 1688 px) between the fight and the ability bar (`fight-Fire-b-port.png`, `tag-port.png`, `tour-fight-port.png`). The sky was cropped, the space moved to the bottom. Idea: raise camera zoom so the fighters and floor fill the band (fighters about 50 px tall are small), or move the ability bar up against the floor edge.
2. First-run hint toast ("Stick moves you...", Got it) still covers the arena: top-left in landscape (overlaps a FIRE x2 chip) and the sky in portrait; on desktop it sits over the lower arena (`fight-Fire-b-land.png`, `fight-Earth-b-desk.png`). Idea: show only during the intro countdown, or auto-dismiss after about 5 s.
3. Portrait 2v2 and Tour: bench thumbnails hang under the HUD and the ability bar is two rows (`tag-port.png`, `tour-fight-port.png`). Idea: one row for the bar; tag slots beside the Strike buttons.
4. Landscape 2v2: player name shows no element glyph ("SINDAROSA 297/297") while the foe has one ("FIARA ▲ 519/519") (`tag-land.png`). Idea: keep the glyph for both or drop for both.

## P3

5. Portrait menu: "Online" and "Play a friend online" run together with no gap (`menu-port.png`). Idea: put the subtitle on its own line or add a margin.
6. Super cut-in hides the foe on desktop (`super-desk.png`); keep the target visible, dimmed.
7. Landscape Strike buttons say only "Strike 1/2" with no ability name (portrait shows Flame/Blast); still open from r102.
8. Tour "Stage 1 of 9 / 3 continues left" chip is sans-serif unlike the serif UI.
9. Versus picker at desktop: "More below" chip over the cut-off paragraph. Cosmetic.
10. Fiara's phoenix is soft against lava; a thin rim light would help.

## Not covered

- Match-end win and lose cards; hero-by-hero Strike labels; real two-browser Online.
