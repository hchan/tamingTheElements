---
status: idea
added: 2026-11-16
---

# QA r75: scorecard (main cfbdd865)

Screenshots: ~/claudetmp/qa-r75/ (headless Chromium via Playwright, dev server port 7951, scripts in the same folder). Scores are 0-5 against Street Fighter / MvC.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Supers have a clear banner and payoff; tag swap works; fights read well in manual-step shots |
| Graphics | 3.5 | Four stage floors are distinct and legible; hero art uneven (Wispera still an orb); FX bright and clear |
| Readability, desktop 1280x720 | 3.5 | Big damage number reads; small secondary numbers still collide; status chips can hide a label |
| Readability, phone landscape 844x390 / 667x375 | 3.5 | Gutter fix works (Pause and Strike buttons clear of the band); first-run card still crosses the band |
| Menu / Help / portrait | 4 | Five-entry menu clean at 1280 and portrait; portrait now shows the menu, not only Rotate; Help readable at 844x390 |
| Overall | 3.5 | Same as r74, with two r74 items fixed |

e2e subset (first-run-hint, arcade-super, arcade-tag): 19 passed.
