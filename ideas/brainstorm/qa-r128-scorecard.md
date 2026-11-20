---
status: idea
added: 2026-11-19
---
# QA r128 scorecard

Build: main at f3510bc4, dev build on port 7932, headless Playwright (SwiftShader, 1280x720, `?manual=1&seed=7`). No phone viewports (not supported).
Shots: `.scratch/qa-r128/` (menu, picker, `10-stage-{Fire,Water,Air,Earth}`, `20-super`, `30-picker-2v2`, `31-2v2`, `32-tag`, `40-tour-pick`, `41-tour-map`, `50-help`).
e2e:smoke via the router: `e2e ran on: PC (job 20261120-033910-short-16d568, short lane) -> exit 0` (all @smoke specs green).
No console or page errors in the run.

| Area | Fun | Graphics | Readability | Evidence |
| --- | --- | --- | --- | --- |
| Overall vs SF / MvC | 3 | 4 | 4 | Four distinct, textured stages with a crowd band and a clear top HUD; fights lack SF-style hit sparks in stills |
| Menu | - | 4 | 5 | Five entries, no banned words, strong dragon art left and right |
| Stages | - | 4 | 3 | Fire, water, air, earth each read at a glance, but the fire stage floor is the same orange-brown as Sindarosa (see qa-r128-fire-stage-hero-blend) |
| 2v2 HUD | 4 | 4 | 4 | Bench tiles under the timer, TAG slot on the bar, Fiara, Rokcore and Sindarosa all readable |
| Tour | - | 4 | 4 | "Stage 1 of 9" card with team, opponents, difficulty, controls and a pin row |
| Help | - | 3 | 3 | Jump-to chips still ragged (already filed as qa-r127-help-chips-ragged) |

Not verified this round (capture limits, not game bugs, unconfirmed): a tag swap by holding `3` in manual mode (the held key did not swap in 13 ticks, `32-tag.png` shows no TAG call), and the super cut-in (25 ticks after the press showed only a ring aura, `20-super.png`). Both are covered by `arcade-tag.spec.ts` and `arcade-super.spec.ts`, so a screenshot spec that grabs them mid-effect is the follow-up.
