---
status: idea
added: 2026-11-16
---

# QA r85 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7, main at 089d234b (portrait polish merge). Shots in `.scratch/r85/` (gitignored, per worktree). No page or console errors in any script.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1280x720 1v1 (4 stages) | 3 | 3.5 | 3.5 | Fire, Water, Air, Earth all distinct now (Water teal-cyan, Air violet-white). Sindarosa still blends into Fire lava. |
| Super cut-in (portrait 390) | 3.5 | 3.5 | 3.5 | Band sits under the HUD, above the bar. |
| 2v2 at 1280x720 | 3 | 3.5 | 3.5 | Bench cards readable. Tag swap works (real key press, real time). |
| Versus picker, desktop | n/a | 3.5 | 4 | Fits at 1280x720. |
| Menu, desktop | n/a | 4 | 4 | Five entries, dragon art, clear focus ring. |
| Help | n/a | n/a | 4 | Tag, Tag 2 and the bar keys are documented. |
| Portrait tall 390x844 | 2.5 | 3 | 3 | Sky void still ~40% of the canvas at spawn; fighters tiny. Better seam than r84. |
| Portrait tall 360x640 | 3 | 3 | 3.5 | Much better: higher horizon, fighters read. |
| Portrait thumb reach | n/a | n/a | 3 | All controls tappable; some targets under 44px wide. |

Stable e2e subset (portrait-play, touch-fight-layout, phone-layout, responsive), three runs in a row, one at a time: run 1 91 passed, run 2 91 passed, run 3 91 passed. 0 failed, 0 flaky.
