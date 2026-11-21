---
status: done
added: 2026-11-18
triaged: d (scorecard duplicates qa-r110-findings.md; low scores are landscape and portrait phone work, dropped 2026-11-18)
---

# QA r110 scorecard (0-5)

Findings are numbered in `qa-r110-findings.md`; screenshots in `.scratch/r110/`.

| Area | Desktop 1280x720 | Landscape 844x390 | Portrait 390x844 | Evidence |
| --- | --- | --- | --- | --- |
| Main menu (Play, Versus, Online, Settings, Help) | 5 | 4 | 3 | d-menu, l-menu single row; p-menu labels glued to subtitles (F4) |
| Play setup (hero pick) | 4 | 3 | 3 | d-play1, l-play1 detail pane cramped, p-play1 ok |
| Pre-fight card | 4 | 3 | 2 | p-f2 FIGHT below fold (F5) |
| Fight HUD readability | 4 | 2 | 1 | l-g1 plate over tile 1 (F1), p-h1-tap tiny HUD (F6) |
| Run Away / Run Towards: keyboard | 4 | n/a | n/a | arena.characters trace, "Run Away on" state; corner trap (F3) |
| Run Away / Run Towards: touch | n/a | 2 | 2 | tile 48 px, no on/blocked feedback (F2) |
| HUD call-outs and weather badge | 3 | 3 | 2 | d-f5 Gale stack overlap (F8), status plates (F7) |
| Help pages | 4 | 3 | 4 | d-helpctl complete tables; l-Help Back hidden (F9) |
| Fight feel versus SF/MvC | 3 | 3 | 2 | long intros (F11), early damage on Easy (F12), corner run (F3) |

Overall: desktop 4, landscape phone 3, portrait phone 2. No console errors, no forbidden words in the UI. e2e not run (no spec execution), so no `e2e ran on:` line.
