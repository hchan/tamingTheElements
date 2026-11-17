---
status: idea
added: 2026-11-16
---

# QA r84 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7. Shots in `.scratch/r84/shots/` (gitignored, per worktree).

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1280x720 1v1 (4 stages) | 3 | 3.5 | 3.5 | Stages distinct, but Water and Air look alike and Sindarosa blends into the Fire lava. |
| Fire Blast trail fade | 3 | 3.5 | 4 | Orb shrinks, short tail, no lingering streak. Fix is visible. |
| Super cut-in (desktop) | 3.5 | 3.5 | 3.5 | Band fits under the HUD, hit numbers read. |
| 2v2 at 1280x720 | 3 | 3.5 | 3.5 | Bench cards readable. Tag swap not confirmed (see findings). |
| Versus picker, desktop | n/a | 3.5 | 4 | 1280x720 and 1366x768 fit; radios and labelled selects clear. |
| Versus picker, 390x844 | n/a | 3 | 3.5 | Usable. |
| Versus picker, 360x640 | n/a | 2.5 | 2.5 | Cramped, stacked Fight/Back, "More below" chips overlap content. |
| Help (Fire Blast falloff) | n/a | n/a | 4 | Text present and correct (inside collapsed details). |
| Portrait tall 390x844 | 2.5 | 2.5 | 3 | Large flat dark sky void, hard seam, fighters tiny at spawn, empty skirt rows. |
| Portrait tall 360x640 | 2.5 | 2.5 | 3 | Same layout, tighter; card and HUD names truncate. |
| Tour (portrait) | 2.5 | 2.5 | 3 | Bench cards crowd the HUD names. |

No page errors in any run.
