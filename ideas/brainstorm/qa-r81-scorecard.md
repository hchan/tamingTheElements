---
status: idea
added: 2026-11-16
---

# QA r81: scorecard (main 03449bfc)

Screenshots: .scratch/r81/shots/ in the QA worktree (agent-aed425986345e4924; gitignored, disposable). Headless Chromium, Playwright, SwiftShader, `vite build --mode test` served by `vite preview` on port 7931. Scores 0-5 against Street Fighter / MvC. No console errors in any run.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers, tag) | 3.5 | Unchanged from r80. Super (Curomo) lands a 96 with fan burst and shockwave rings; tag swap shows "TAG!", entrance chevrons, 2.7 s tag cooldown on the benched portrait |
| Graphics | 3.5 | Four stages read as distinct (lava cracks, ice blue, sand, pale air) with labelled hazard chips; hero art still flat next to SF/MvC sprite work; Pax (earth) and Rokcore (earth) read as near-twins in the earth mirror |
| Readability, desktop 1280x720 | 4 | HUD, WINS pips, weather banner and chips, hit counter and action bar clean |
| Readability, 568x320 / 844x390 | 4 | Menu and picker no overflow; fight HUD not re-shot this round (covered by e2e first-run-hint and arcade-tag size specs, all green) |
| Portrait 390x844 | 2.5 | Unchanged from r80: ~390x120 arena strip in a huge black area, action bar over the arena, four stacked foe chips, hint card larger than the arena |
| Menu / Help / Settings / Tour | 4.5 | Five entries, no mode words, scrollWidth equals clientWidth at 1280, 844, 667, 568 and 390; Tour picker and "Stage 1 of 9" screen clear |
| Overall | 3.5 | No regressions; portrait still the weak spot |

E2E (Chromium, 1 worker, port 7931): app-flow, arcade-tag, arcade-super, arena-smoke, first-run-hint, 26 of 26 passed. Not run: lint, typecheck, vitest, full e2e suite.
