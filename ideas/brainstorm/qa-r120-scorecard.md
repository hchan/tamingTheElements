# QA r120 scorecard (0-5 vs Street Fighter / Marvel vs Capcom)
status: idea
added: 2026-11-19

Desktop 1280x720, headless, main f1d3ba53. Details in qa-r120-findings.md. Screenshots in `.scratch/qa-r120/`.

| Screen | Fun | Graphics | Readability | Note |
|---|---|---|---|---|
| Menu (`01-menu.png`) | 3 | 4 | 5 | Five entries, no banned words; focus falls off the page after Help. |
| Hero select, 12 heroes (`hero-*.png`) | 3 | 4 | 4 | All portraits load, no overflow. |
| 1v1 fight and KO (`g-ko1.png`, `d-fight-40.png`) | 3 | 4 | 4 | KO banner clear; Snag feedback good. |
| Round/match stat card (`g-win.png`) | 4 | 4 | 3 | Nice stats, text faint while it fades in over the action. |
| Match end, Defeat (`d-end.png`) | 3 | 4 | 4 | Clear, no bottom padding. |
| Match end, 2v2 Victory (`j-2v2-end.png`) | 3 | 4 | 2 | Two of three buttons below the fold. |
| Parry (`j-parry.png`) | 3 | 3 | 3 | Works, understated. |
| Pause (`i-pause.png`) | 3 | 4 | 5 | Focus, Tab cycle and Escape all good. |
| Settings (`f-settings0.png`) | 2 | 3 | 4 | Persists; Display size effect unclear; Save first in Tab order. |
| Tour briefing (`k-tour0.png`) | 3 | 4 | 4 | Clear ladder; loading interstitial after Fight. |

Overall: fun 3.0, graphics 3.8, readability 3.8. Smoke: PC, 15 passed. No console errors.
