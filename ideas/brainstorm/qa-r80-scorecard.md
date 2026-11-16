---
status: idea
added: 2026-11-16
---

# QA r80: scorecard (main d38905bf)

Screenshots: ~/claudetmp/shots/r80/ (stage, super, 2v2, tag, menu, help, tour) and ~/claudetmp/qa-r80/ (phone and portrait). Headless Chromium, Playwright, dev server `--mode test` on port 7981. Scores 0-5 against Street Fighter / MvC. No console errors in any run.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Unchanged. Super lands with a big number, blue fan burst and shockwave rings; tag swap shows "TAG!", entrance chevrons and a 2.0 s tag cooldown on the bar; "Can't swap: stunned" is clear feedback |
| Graphics | 3.5 | Four stages read as distinct (lava cracks, ice blue, sand, pale air); hazard patches carry labelled chips (FIRE x2, WATER +HP, ROCK, AIR x2). Hero art is still flat next to SF/MvC sprite work |
| Readability, desktop 1280x720 | 4 | HUD, WINS gap, status chips, hit counter and action bar all clean |
| Readability, phone 844x390 | 4 | Fullscreen toggle and Pause clear of the HUD; counter readable |
| Readability, 568x320 | 3.5 | Hit counter now reads "3 HITS / 66 DMG" with the toggle beside it (r79 overlap fixed); WINS pips tiny but separated |
| Portrait 390x844 | 2.5 | Unchanged: ~390x215 arena strip, second action-bar row over the arena, four stacked foe chips; "Play anyway" overlay works |
| Menu / Help / Settings / Tour | 4.5 | Five entries, no mode words, no overflow at 5 sizes; Tour picker clear |
| Overall | 3.5 | r79 568 fixes verified; portrait still open |

E2E (Chromium, 1 worker, port 7977): tour-win, arcade-tag, arcade-super, stage-hazards, 23 of 23 passed. Not run: lint, typecheck, vitest, round-end screen.
