---
status: done
added: 2026-11-17
---

# QA r93 scorecard (main 2eca0a0e)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots are under `.scratch/shots/` (gitignored), named `<vp>-<name>.png` with vp = d (1280x720), p390 (390x844, desktop Chromium with touch) or m390 (390x844 with isMobile).
Driven headless (Chromium, SwiftShader), manual-mode stepping, seed 7, preview build of `--mode test` on E2E port 7961. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Match end: win | 3.5 | 3.5 | 4.5 | Result word now yellow on a dark plate, clearly readable. Own hero large, foe small beside it. `d-end-win.png`, `p390-end-win.png` |
| Match end: loss | 3 | 3.5 | 4 | Own hero plus foe shown, pale-pink DEFEAT readable. Layout identical to win. `d-end-loss.png`, `p390-end-loss.png` |
| Match end: draw | 3 | 3.5 | 4 | Both portraits now equal size, DRAW readable. `d-end-draw.png`, `p390-end-draw.png` |
| First-run card | n/a | 3.5 | 4 | Holds through intro banners, appears under the HUD on phone, never after a super. `m390-card-2.png` |
| Fight (Fire, 1v1) | 3.5 | 4 | 4 | `d-fr-1-t70.png`, `m390-f2-10.png` |
| Super on phone | 3.5 | 3.5 | 4 | Banner clear of the card. `m390-super-a.png` |
| Phone portrait entry | n/a | 2.5 | 3 | Rotate overlay covers the fight on first entry. `m390-f0.png` |
| Versus picker | n/a | 3.5 | 4 | `d-versus.png`, `p390-versus.png` |
| Play (tour pick) | n/a | 3.5 | 3.5 | Hero tile label wraps to three lines at 390. `p390-play.png` |
| Help | n/a | 3.5 | 4 | `p390-help.png` |
| Settings | n/a | 3.5 | 4 | `d-settings.png` |
| Menu | n/a | 4 | 4 | Five entries, no mode words. `d-menu.png`, `p390-menu.png` |

## e2e subset

Not run this round (browser-only play pass, one browser job).
