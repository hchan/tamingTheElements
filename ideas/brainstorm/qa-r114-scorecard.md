# QA r114 scorecard

status: idea
added: 2026-11-18

Build: main at 46992a0d (swap-allowed merge), dev build, headless Playwright (SwiftShader), `?seed=7`.
Covered: menu, Help, hero picker (1v1 and 2v2), fights (1v1 and 2v2) at 1280x720, 844x390, 390x844, 360x640; live desktop 2v2 run (STUN, Run note).
Not covered: match end, super cut-in, tag swap (see findings 10).

## Scores (out of 5)

| Area | Fun | Graphics | Readability | Note |
| --- | --- | --- | --- | --- |
| Menu | - | 4 | 5 | Clean, 5 entries, no banned words |
| Help | - | 4 | 4 | Chips wrap well, long page |
| Hero picker | - | 3 | 4 | Fine in portrait, "More below" cue works |
| 1v1 desktop | 4 | 4 | 4 | Clear HUD, STUN readable |
| 2v2 desktop | 4 | 4 | 4 | NO SNAG chip clipped by terrain badge |
| Portrait fight | 3 | 3 | 3 | Bigger fighters, still lots of empty sky, names truncate at 360 |
| Landscape phone | 3 | 3 | 3 | Buttons outside canvas, small Strike circles |
| Touch ergonomics | - | - | 3 | Portrait tiles 40-43 px wide, below 44 |

Overall: 3.5 / 5. Fun and feel could not be judged on hit feedback or match end this round.

## Verified recent changes

- Portrait fighter framing: fighters about 1.4x bigger, improvement, but sky still 35-40% empty (finding 1).
- Terrain plate word chips: render, but repetitive and overlap the NO SNAG chip (findings 5, 9).
- Run box note: "Can't run: stunned" shows, but about 8 px and dim (finding 4).
- HUD STUN for a frozen active hero: works on the Tag tile, seen in a real live run (`.scratch/qa-r114/desk-live-final.png`). iced/downed statuses correctly do not trigger it.

## r113 re-check

| r113 finding | State |
| --- | --- |
| Menu layout | Fine at 390 (checked) |
| Name truncation at 360 (r113 #3) | Not fixed (finding 2) |
| Picker | Fine in portrait at 360 (checked) |
| Others (4-6, 8-10) | Not re-verified in detail this round |

## e2e smoke

`corepack pnpm e2e:smoke` (E2E_PORT=7914), first PC attempt was lost (rc 93, state lost), the router retried on its own:

`e2e ran on: PC (job 20261119-044059-short-aa7075, short lane) -> exit 1`

14 passed, 1 failed. Failure: `tests/e2e/portrait-play.spec.ts:118` "portrait play 360x640 > the canvas is tall: it fills down to the deck, the floor sits on the bar, the sim is unchanged": `camZoom` expected >= 1.05, received 0.952 (poll timed out after 5 s). This matches finding 1 (portrait framing at 360x640 is not zoomed in enough). Not rerun on the Mac, per the rules. Log: `.scratch/smoke.log`, results under `.scratch/remote-e2e/20261119-044059-short-aa7075/`.
