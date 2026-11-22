---
status: done
added: 2026-11-19
---
# QA r129 scorecard

Build: main at 28bcbc8c, built clean, dev server (test mode) on port 7937, headless Chromium SwiftShader 1280x720, `?manual=1&seed=7`. No phone viewport. No console or page errors in the run.
Shots: `.scratch/qa-r129/` (01-menu, 02-picker, 10-fight-banner, 11/12-stage-{fire,water,earth,air}, 20/21-super, 30-picker-2v2, 31-2v2, 34-tag-call, 40-tour-pick, 41-tour-map, 50/51-help).

| Area | Fun | Graphics | Readability | Evidence |
| --- | --- | --- | --- | --- |
| Overall vs SF / MvC | 3 | 4 | 4 | Top HUD, crowd band and bottom ability bar read clearly; stills show little hit-spark feedback |
| Menu | - | 4 | 5 | Five entries, no banned words |
| Stages | - | 4 | 4 | Fire, water, earth, air distinct; air stage Echo is pale on pale (qa-r129-echo-pale-on-air-floor) |
| Super | 4 | 4 | 4 | GLACIER CRASH band with portrait, dimmed arena, clear |
| 2v2 and tag | 4 | 4 | 4 | Tag works with `Digit3` + `stepLive(1)` (34-tag-call: Pax in, Sindarosa on bench tile, TAG 3.0s); a plain `step` with the key held does not swap, a capture limit, not a bug. Status chips already filed in qa-r126 |
| Tour | - | 4 | 4 | Stage 1 of 9 card, controls list, team, stage tiles |
| Help | - | 3 | 3 | Jump-to chips ragged (qa-r127-help-chips-ragged) |

Versus picker at 720p still clips the footer text under the "More below" chip (qa-r127-more-below-chip-covers-text).
triaged: 2026-11-21 closed as obsolete; scorecard table duplicates qa-r129 findings.
