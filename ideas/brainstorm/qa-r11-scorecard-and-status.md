---
status: idea
added: 2026-11-14
---
# QA r11 scorecard and status (headless Playwright, 1280x720 plus 390x844 / 844x390)

Method: dev build on port 7900, real-time keyboard bot fights (several heroes vs several foes), deterministic `__TTE__.arena` hooks for Snag, super, KO and results, fresh-profile context, stubbed gamepad. Screenshots in ~/claudetmp/qa-r11/ (disposable). No page errors in any run; `arcadeAudio().played` rose above 0 in every fight (audio cues fire).

Not covered: in-fight touch controls on mobile (only the Play picker was checked on touch), a real 2v2 tag fight (Versus picker offers 1v1 / 2v2 / 3v3 and a partner select; Tag keys 3/4 not exercised in a fight), real gamepad input (only the Help text hint was found).

| Area | r10 | r11 | Note |
|---|---|---|---|
| Fun / feel | 3 | 3 | Slam banners, outlined hit numbers and the super banner ("HELLFIRE LANCE / FIRE" on an orange band) read well. The bot lost round 1 in every real-time fight, so no pacing verdict. |
| Graphics | 3.5 | 3.5 | Stage floors distinct. Lavax too dark; Cyclonius life bar flat. |
| Readability | 3.5 | 3 | Round-end panel text duplicated and covers fighters; Snag unlabeled. |
| Intro / first run | 3.5 | 3 | First-run card still covers the action (r10 open, unfixed). |
| Mobile | n/a | 2.5 | Portrait picker: hint pill overlaps Start/Back, names wrap mid-word. |
| Online screen | 2 | not re-scored | |

## Status vs r10
- Still open: first-run FIRST BLOOD card covers the opponent and action slots; Versus picker stale "1 of 1 picked" / "Add to team".
- Not re-verified: floor chips vs ROUND/FIGHT overlap (none seen), earth crystal prop, settings seam. Default fighters still lopsided (Sindarosa 272 life vs Ishimi 588 in the Versus test).
- Holding: menu, Play and Versus wording is clean (no Classic, Arcade, ruleset or Capture); Dash/Weather tooltip not stuck.
- New findings: qa-r11-round-end-panel, qa-r11-snag-discoverability, qa-r11-menus-and-picker-polish, qa-r11-mobile-portrait-picker, qa-r11-first-run-card.
