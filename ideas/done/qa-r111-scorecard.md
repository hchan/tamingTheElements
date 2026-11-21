---
status: done
triaged: d (scores only, no actionable items; phone/portrait columns dropped 2026-11-18; duplicates the r112 findings file)
added: 2026-11-18
---

# QA r111 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), screenshots in `.scratch/r111/`.

| Axis | Desktop 1280x720 | Phone landscape 844x390 | Phone portrait 390x844 / 360x640 |
|---|---|---|---|
| Fun | 3.5 | 3.5 | 2.5 |
| Graphics | 4 | 4 | 3.5 |
| Readability | 3.5 | 3 | 2.5 |

- Graphics: the four stages (fire, water, earth, air) each have a distinct palette and crowd backdrop. The heroes are painted and rigged and look good.
- Fun: the tag swap, super and 2v2 all work. The bar has 12 tiles, which is more than SF/MvC show on screen.
- Readability: the HUD is clear on desktop. The action bar is dense and the tiles are small on phones. Portrait is poor (see findings).

r110 fixes: landscape Tour plate verified (`l-tour-fight.png`). Touch Run tile on-state inconclusive (see findings).
