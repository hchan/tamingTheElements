---
status: idea
added: 2026-11-16
---

# QA r76: scorecard (main e6a731ef)

Screenshots: ~/claudetmp/qa-r76/ (headless Chromium via Playwright, dev server port 7975, scripts in the same folder). Scores are 0-5 against Street Fighter / MvC.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Supers and tag swap read clearly; KO entrance is now clean |
| Graphics | 3.5 | Four stage floors distinct; hero art uneven (Wispera still an orb) |
| Readability, desktop 1280x720 | 3.5 | Big damage number reads; small secondary numbers still collide; SNAG label still half hidden |
| Readability, phone landscape 844x390 / 667x375 | 3.5 | Gutter fine; first-run hint card still crosses the super band |
| Menu / Help / portrait | 4 | Five-entry menu clean at 1280, 844, 667 and portrait |
| Overall | 3.5 | r75 KO-ghost fix verified; chip fade mostly fixed |

e2e subset (first-run-hint, arcade-super, arcade-tag; `playwright test <files> --workers=1`): 19 passed, 1.4 min. Nothing else run.
