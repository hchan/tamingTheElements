# QA r121 scorecard

status: idea
added: 2026-11-19

Build: main at 724b7ce1 (`Merge tour chips and Help height`), dev server in test mode, headless Chromium with SwiftShader, `?manual=1&seed=7&ff=arcade`, 1280x720 only (no phone viewport this round).
Screenshots: `.scratch/qa-r121/`. Not played by hand: this is stepped play (manual ticks), so feel is judged from frames, not live input.

## Covered

Menu (`01-menu`), Versus picker (`02`, `03`, `07`, `10`), 1v1 on all four stages (`04-stage-fire`, `06-stage-air`, `07-stage-water`, `08-stage-earth`), tag swap (`14`, `15`), super (`16` to `18`), 2v2 results and Escape (`40` to `43`), Settings Escape with a slider focused (`50`), Tour cards and fights 1 to 3 (`61` to `63`), Help (`30`, `31`).
Smoke: `e2e ran on: PC (job 20261119-133024-short-dcd97a, short lane) -> exit 0` (15 passed).
`keyboard.spec.ts:93` (no keyboard trap on #keyBindings) FAILS on this main: Tab never reached Back in 60 presses (PC job 20261119-133300-short-c28cc6, 12 passed, 1 failed). See finding 8.

## Recent fixes, checked

| Fix | Result |
| --- | --- |
| 2v2 results: Rematch focused, Escape returns to menu, fits 720p | Not confirmed: focus is on the heading, Escape does nothing, buttons run to y 743 (finding 1) |
| Escape on Settings with a slider focused | Not confirmed: stays on Settings (finding 2); works with nothing focused |
| Tour reaches fights 2+ | Confirmed: stages 2, 3 and 4 cards appear after forced wins |
| Tour card names the lead hero's real abilities | Not confirmed: generic key list, shows Snag for a hero without it (finding 4) |
| Help: chips in two rows of three, no touch table | Touch table gone; chips are three rows of 4, 1, 4 (finding 3) |

## Scores 0-5 (vs Street Fighter / Marvel vs Capcom)

| Area | Fun | Graphics | Readability | Note |
| --- | --- | --- | --- | --- |
| Desktop 1280x720 fight | 3.5 | 3.5 | 4 | Clean SF-style top HUD, big damage numbers, four distinct stage looks; fighters are static paintings. |
| Four stages | 3.5 | 4 | 4 | Fire cracks, water caustics, air frost and earth each read at once; weather chip glyph is wrong (finding 5). |
| Tag swap and 2v2 HUD | 3.5 | 3.5 | 3.5 | Bench portraits and TAG call read well; combo counter collides with chips. |
| Super | 4 | 4 | 3.5 | Hellfire Lance band and lance blasts are the best moment; overlaps (finding 6). |
| 2v2 results | 3 | 3.5 | 2.5 | Strong winner banner, but the buttons run off a 720p screen and the focus cue is missing (finding 1). |
| Menu | 3 | 4 | 4 | Strong key art, five clear rows. |
| Versus picker | 3 | 3 | 3 | Dense; works. |
| Tour | 3.5 | 3.5 | 3.5 | Card and stage strip are clear; controls row is generic (finding 4). |
| Help | 3 | 3.5 | 3.5 | Large readable text; chip block is ragged (finding 3). |
| Settings and keyboard | 2.5 | 3 | 3 | Escape on a slider does nothing; a keyboard-trap test is red (findings 2 and 8). |

Overall: fun 3.5, graphics 3.5, readability 3.5.
