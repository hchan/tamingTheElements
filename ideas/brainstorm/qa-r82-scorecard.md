---
status: idea
added: 2026-11-16
---

# QA r82: scorecard (main d96baa44, includes portrait P1, P3, P4)

Screenshots: .scratch/r82/shots/ in the QA worktree (agent-a1d0e4bcecc9cf60a; gitignored, disposable). Headless Chromium, Playwright, SwiftShader, `vite build --mode test` served by `vite preview` on port 7996. Scores 0-5 against Street Fighter / MvC. No console errors in any run.

| Area | Score | Note |
|---|---|---|
| Fun (feel, supers) | 3.5 | Unchanged. Super lands 90-110 hits with fan burst and rings; hit counter "3 HITS 128 DMG" reads well |
| Graphics | 3.5 | Four element floors distinct in the Classic demo (dark water, misty air); the Arcade Fight picker always gave the lava floor whatever the races; hero art still flat next to SF/MvC |
| Readability, desktop 1280x720 | 4 | HUD, WINS pips, action bar and super rings clean |
| Readability, phone landscape 844x390 / 568x320 | 4 | One-row bar, stick left, Strike 1/2 right; at 568x320 the strikes sit on the foe sprite and Pause/fullscreen overlap the HUD edge |
| Portrait 390x844 / 360x640 / 768x1024 | 3.5 | Up from 2.5. Canvas pinned under a 52 px strip at full width (390x219, 360x203, 768x432), single-row bar, one-line card clear of the buttons. Still a huge empty black band between bar and stick, bar is far from the thumbs, skirts missing under the first three slots |
| Menus / Help | 4.5 | Five entries, no mode words, version stamp d96baa44; Help jump chips wrap cleanly at 390 |
| Overall | 3.5 | Portrait is now playable; remaining gap is vertical space use |

E2E: see qa-r82-findings.md.
