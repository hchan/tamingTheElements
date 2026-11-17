---
status: idea
added: 2026-11-17
---

# QA r90 scorecard (main 53099fee)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots are under `.scratch/r90/` (gitignored).
Driven headless (Chromium, SwiftShader), manual-mode stepping, seed 7. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1v1, Fire/Water/Earth/Air (1280x720) | 3.5 | 4 | 4 | Four distinct stages, terrain chips, clear HUD. Sindarosa red wings low contrast on Fire and Earth. `d-stage-*-fight.png` |
| Portrait phone HUD (390x844, 360x640) | 3 | 3.5 | 3.5 | Full-life names fit whole (r89 P1 fixed). Names still truncate when a status word shows. Sky void and small fighters remain. `p360-Cyclonius-hit.png` |
| Versus picker on phone | n/a | 3.5 | 3.5 | Footer is one compact row (r89 P2 fixed, ~12% of 360x640). Mode/difficulty/arena options still far below the grid. `versus-360.png`, `versus-390.png` |
| Super (Hellfire Lance) | 3.5 | 3.5 | 4 | Works on desktop and phone; cut-in is a modest banner versus MvC. `dsuper-*.png`, `psuper-*.png` |
| 2v2 and tag swap | 3.5 | 4 | 3.5 | Tag works (Digit3), cooldown and bench icon shown. `d-2v2-tag1.png` |
| Round flow (KO, round card, banners) | 4 | 4 | 4 | Good SF-like presentation. `round1-card.png` |
| Match-end screen | 2.5 | 2.5 | 3.5 | Plain, top-left heavy, posterized upscaled portraits, no stats. `match-end.png` |
| Menu | n/a | 4 | 4 | Five entries, clean. `d-menu.png`, `p-menu.png` |
| Online | n/a | 3 | 3.5 | Manual serverless codes; text heavy but clear, no overflow at 390. `p-online.png` |
| Tour (Play) | n/a | 3.5 | 3.5 | Covered to the hero-pick page only (3 slots, details card). `d-play.png` |

## e2e subset

See the results line in the findings file.
