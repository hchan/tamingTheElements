---
status: idea
added: 2026-11-16
---

# QA r79: scorecard (main 7cba6fab)

Screenshots: ~/claudetmp/qa-r79/ (headless Chromium, Playwright, dev server `--mode test` on port 7986; r78 scripts reused). Scores 0-5 against Street Fighter / MvC. No console errors in any run.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Unchanged; not re-tested beyond short exchanges |
| Graphics | 3.5 | Unchanged since r78 |
| Readability, desktop 1280x720 | 4 | WINS pips now have a visible gap between the two groups; stun and status chips clean |
| Readability, phone 844x390 | 4 | Fullscreen toggle sits clear of the HUD; hit counter readable |
| Readability, 568x320 | 3 | Fullscreen toggle now overlaps the hit counter ("3 HITS / 66 DMG" shows as "3 / 66"); WINS WINS still tight |
| Portrait 390x844 | 2.5 | Unchanged: thin strip, bar wraps over arena, four stacked foe chips. "Play anyway" is now a role=button (r78 item fixed) |
| Menu / Help / Settings | 4.5 | Help "Jump to" row has a scroll chevron at 568; Help in portrait wraps cleanly; no overflow at 5 sizes |
| Overall | 3.5 | HUD-POLISH-1 and HELP-A11Y-1 verified; one 568 overlap, portrait still open |

Not run: e2e, lint, typecheck, vitest. Round-end screen not reached (the round was still at 12 s after the stepped ticks; not captured).
