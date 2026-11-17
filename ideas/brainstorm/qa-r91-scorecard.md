---
status: idea
added: 2026-11-17
---

# QA r91 scorecard (main fbc2085d)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots are under `.scratch/r91/` (gitignored).
Driven headless (Chromium, SwiftShader), manual-mode stepping, seed 7 (Tour seed 42). No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1v1, Fire/Water/Earth/Air (1280x720) | 3.5 | 4 | 4 | Four distinct stages, terrain chips, clear HUD and action bar. `d-Fire-fight.png`, `d-Water-fight.png`, `d-Earth-fight.png`, `d-Air-fight.png` |
| Portrait phone HUD (390x844, 360x640) | 3 | 3.5 | 4 | Whole names at full life and at 40% life (r89 and r90 P1 verified). Tall empty sky above small fighters remains. `p360-hit.png`, `p390-hit.png` |
| Versus picker on phone | n/a | 3.5 | 3.5 | Footer is one slim row; "More below" chip sits on its edge. `p390-versus.png`, `p360-versus.png` |
| Super (Hellfire Lance, Titan Slam) | 3.5 | 3.5 | 3.5 | Modest banner versus MvC. On phone the first-fight tutorial card covers the banner. `d-2v2-super-15.png`, `p390-super.png` |
| 2v2 and tag swap | 3.5 | 4 | 3.5 | TAG call, flash, bench icon and cooldown clear. `d-2v2-tag-10.png` |
| Tour (play a fight) | 3.5 | 4 | 3.5 | Desktop fight playable: stage 1 of 9, continues, tag tiles, damage numbers. Stage card clear and says Snag. `d-tour-fight.png`, `d-tour-card.png` |
| Tour on phone | n/a | 3.5 | 3 | Stage card good; arena starts behind the rotate gate. `p390-tourcard.png`, `q360-tourfight.png` |
| Menu | n/a | 4 | 4 | Five entries, no mode words. `d-menu.png`, `p390-menu.png` |
| Help | n/a | 3.5 | 4 | Chips and collapsible sections; "Ways to..." chip clipped at 390. `p390-help.png`, `d-help.png` |

## e2e subset

See the results line in the findings file.
