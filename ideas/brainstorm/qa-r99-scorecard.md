---
status: idea
added: 2026-11-17
---

# QA round 99 scorecard

Build: current main (60264360, Merge round-end banner readability). Headless Chromium + SwiftShader, 390x844, 360x640 and 1280x720. Shots in `.scratch/shots99/` (gitignored).

## Overall

| Axis | r98 | r99 | Delta | Note |
|---|---|---|---|---|
| Fun | 3.4 | 3.4 | 0.0 | No sim change this round; fights still read as spaced-out duels on phone |
| Graphics | 3.8 | 3.8 | 0.0 | Stages look good on desktop; portrait still shows a lot of empty sky |
| Readability | 4.0 | 4.1 | +0.1 | Round banner, cut-in band, SAFE chip and floor band all clean; match-end card has small text breaks |

## By area

| Area | Score | Note |
|---|---|---|
| Menu (5 entries) | 4.5 | Clean, no banned words |
| Help | 4.3 | Chips wrap correctly at 360 |
| Hero select / Versus picker | 4.2 | Labels and More-below chip fine |
| 1v1 fire/water/earth/air, desktop | 4.2 | Action bar and floor band good |
| 1v1 portrait 390x844 | 3.3 | Camera closer than r98 but sky still ~35-45% on Water/Fire; fighters at screen edges |
| Two-row ability bar (phone) | 3.4 | Hides the lower floor on Water, Air and 2v2 |
| Super cut-in | 4.4 | Full-width band, no title collision, SAFE chip and terrain chips not overlapping |
| Tag swap / 2v2 HUD | 3.8 | Works; bench portraits crowd SAFE chip on phone |
| Tour card | 4.3 | Scannable at 390; fight button reachable |
| Round-end banner / result card | 4.3 | Bold, legible at phone sizes |
| Match-end win/loss | 3.6 | Hero name breaks mid-word at 360; tile misalignment at 390 |

## What worked

- Round-end banner and result card legible at 390 and 360 (round-end-panel and round-result-real-fight specs pass).
- No sky hairline; floor band sits behind the action bar.
- Terrain chips hidden during cut-in; SAFE chip stays above the band, no overlap at 390 or 360.
- Tour card readable at 390; 0 console or page errors across the whole flow (menu, picker, 4 stages, supers, 2v2, tag, Tour at 3 sizes).

## Not done

- No real touch-device or real-GPU run; no audio check; no online mode.
- Stable e2e subset limited to the 57 portrait/round-end/Tour/match-end/Versus specs, not the full ~128.
