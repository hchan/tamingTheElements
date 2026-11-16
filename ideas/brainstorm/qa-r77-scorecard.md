---
status: idea
added: 2026-11-16
---

# QA r77: scorecard (main 76a0c7e7)

Screenshots: ~/claudetmp/qa-r77/ (headless Chromium via Playwright, dev server `--mode test` on port 7977, scripts in the same folder). Scores are 0-5 against Street Fighter / MvC.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Supers read well on every size; hit counter ("3 HITS / 52 DMG") shows on phones |
| Graphics | 3.5 | Four stage floors distinct; Wispera still a plain blue orb (top-left icon and in-arena) |
| Readability, desktop 1280x720 | 3.5 | SNAG word now sits below the chips; it renders grey and dim |
| Readability, phone 844x390 / 667x375 | 4 | Hint card no longer crosses the super band (verified); small secondary numbers still collide |
| Readability, 568x320 | 3 | Fullscreen toggle still sits over the foe portrait and the end of its life bar |
| Menu / Help / portrait | not re-run | Not in scope this round |
| Overall | 3.5 | Both merged fixes verified; two old items remain |

e2e actually run (`corepack pnpm exec playwright test <files> --workers=1`, own E2E_PORT 7979):
- first-run-hint.spec.ts + small-viewport-fight.spec.ts: 12 passed in 2.1 min (includes the one `test.fail` for the fullscreen toggle, which "fails" as expected).
- ability-fx.spec.ts `-g snag`: 7 passed in 31 s.
Nothing else run (no lint, typecheck, vitest, other specs).
