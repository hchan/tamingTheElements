---
status: idea
added: 2026-11-16
---

# QA r78: scorecard (main daff5583)

Screenshots: ~/claudetmp/qa-r78/ (headless Chromium, Playwright, dev server `--mode test` on port 7985; scripts dmg.cjs, dmg2.cjs, zero.cjs, port.cjs, menu.cjs in the same folder). Scores are 0-5 against Street Fighter / MvC.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Exchanges read clearly at every size; big white number plus a small grey secondary number per hit |
| Graphics | 3.5 | Floors and heroes unchanged since r77; Wispera orb not re-reported |
| Readability, desktop 1280x720 | 4 | Damage numbers sit clear of pops, chips and the combo block |
| Readability, phone 844x390 / 667x375 | 4 | No number-on-number or number-on-pop collisions seen in 5 live exchanges per size |
| Readability, 568x320 | 3.5 | Numbers fine; open r77 items (fullscreen toggle, WINS WINS) still there |
| Portrait phone 390x844 | 2.5 | Rotate gate; behind "Play anyway" the arena is a thin strip and the action bar wraps over it |
| Menu / Help / Settings | 4 | All five entries, Help and Settings render with no horizontal overflow at all five sizes; no console errors |
| Overall | 3.5 | DMGNUM-1 verified; one new portrait issue |

e2e actually run (`E2E_PORT=7986 corepack pnpm exec playwright test tests/e2e/arcade-juice.spec.ts --workers=1`): 6 passed in 45 s, including both new DMGNUM-1 cases (1280x720 and 844x390). Nothing else run (no lint, typecheck, vitest, other specs).
