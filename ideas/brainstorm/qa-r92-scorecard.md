---
status: idea
added: 2026-11-17
---

# QA r92 scorecard (main ea6fe5b7)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots are under `.scratch/shots/` (gitignored), named `<vp>-<name>.png` with vp = d (1280x720), p390 (390x844), p360 (360x640).
Driven headless (Chromium, SwiftShader), manual-mode stepping, seed 7. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1v1, Fire/Water/Earth/Air | 3.5 | 4 | 4 | Four distinct stages, terrain chips, clear HUD. `d-fight-Fire-a.png`, `d-fight-Water-a.png`, `d-fight-Earth-a.png`, `d-fight-Air-a.png` |
| Portrait phone HUD | 3 | 3.5 | 4 | Whole names (FIARA, MORBLASS, CUROMO, WISPERA, SINDAROSA). Empty sky above small fighters remains. `p390-fight-Fire-b.png`, `p360-fight-Air-a.png` |
| Super (Hellfire Lance) | 3.5 | 3.5 | 4 | Banner now readable on phone with the tutorial card out of the way. Still a banner, not an MvC slam. `p360-super-4.png`, `p390-super-10.png` |
| 2v2 and tag swap | 3.5 | 4 | 3.5 | TAG tile, bench icons, cooldown clear. `p390-tag-6.png`, `d-tag-6.png` |
| Match end: win | 3.5 | 3 | 3.5 | Portrait, name, result word, Rematch present; result word low contrast. `d-end-win.png`, `p390-end-win.png`, `p360-end-win.png` |
| Match end: loss | 3 | 3 | 3 | Headlines the winner with a low-res portrait. `d-end-loss.png`, `p390-end-loss.png` |
| Match end: draw | 2.5 | 2.5 | 3 | No portrait. `d-end-draw.png`, `p390-end-draw.png` |
| Versus picker and More-below tab | n/a | 3.5 | 4 | Tab clears the footer at 360 and 390. `p360-versus-bottom.png`, `p390-versus-bottom.png` |
| Help | n/a | 3.5 | 4 | Chips wrap at 360 and 390, none clipped; chip styling inconsistent. `p360-help.png`, `p390-help.png` |
| Online | n/a | 3 | 3 | Technical copy-paste host-code flow. `p360-online.png`, `d-online.png` |
| Tour | 3.5 | 4 | 3.5 | `d-tour.png`, `p390-tour.png` |
| Menu | n/a | 4 | 4 | Five entries, no mode words. `d-menu.png`, `p390-menu.png` |

## e2e subset

See the results line in the findings file.
