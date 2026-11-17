---
status: idea
added: 2026-11-17
---

# QA r101 scorecard (headless Chromium, SwiftShader, 1280x720, 390x844, 360x640)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots101/` in the r101 QA worktree (gitignored).
Build: current main at 4a64eeab, `--mode test`, preview on port 7960. Console and page errors across all runs: none.

## Overall

| Axis | r100 | r101 | Note |
| --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | Unchanged: fights read, supers and tags land; no new combat content this round. |
| Graphics | 3.8 | 3.8 | Four stages, fire/ice/earth/air backdrops cohere; portrait sky still takes about half the screen. |
| Readability | 4.2 | 4.3 | Strike labels no longer ellipsize, Online role screen is clear, Help names Strike 1/2. Small label edge-fit issues remain. |

## By area

| Area | Result |
| --- | --- |
| Menu, Help (3 viewports) | Clean; Help copy uses Strike 1/2 and no banned words. |
| Online role screen | Good: two big buttons "I am hosting" / "My friend is hosting". Heading wraps at 360, Back shown twice. |
| 1v1, all four stages | Fine at desktop and both phones. |
| Tag swap, 2v2 portrait | No half-clipped fighter after the swap at 390 or 360 (r100 P2 fixed). |
| Super | Banner reads; hero portrait and name clear. |
| Match end on phone | Lose card buttons are on screen at 390 and 360 (Rematch bottom 473/544 of 844, 419/486 of 640). |
| Tour | Card and fight HUD fit at 360; action bar is two rows. |

## Not done

- Win-path match-end card was not captured (the scripted round 2 did not finish); lose path only.
- Hero select picker was exercised through the form selects, not by screenshot review of every hero.
- Desktop e2e subset counts are in the findings file.
