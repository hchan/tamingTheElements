---
status: idea
added: 2026-11-11
---

# 2v2 balance outliers and Hard stalemates

2v2: Echo +7.4, Rokcore -8.0, Wispera -6.8 pp. Hard 1v1 stalemates (18 vs 12). Use `pnpm balance:compare`.

## Findings (2026-11-14, balance-outliers agent)

No sim change made. Arcade 2v2 (8 seeds, 528 matches, about 88 matches per race) at SIM_VERSION 59: Echo 58.0%, Pax 43.2%.
Probed `ARCADE_2V2_LIFE_PM` (`pnpm balance:compare --ruleset arcade --team-size 2`):

| echo / pax life pm | Echo | Pax | other races moved |
|---|---|---|---|
| 640 / 612 (baseline) | 58.0 | 43.2 | - |
| 600 / 655 | 58.0 | 54.5 | Sindarosa -9.1, Cyclonius +8.0 |
| 540 / 635 | 43.2 | 52.3 | Rokcore -15.9 (untouched), Echo -14.8 |
| 575 / 640 | 60.2 | 45.5 | Rokcore -11.4 (untouched) |

The response is non-monotone (less Echo life gave more wins at 575; Pax 635 -> 640 is 52.3 -> 45.5; untouched Rokcore swings 11-16 pp),
so the 2v2 tournament's noise at 8 seeds (about +-8 pp per race) exceeds the effect of any life tweak. Tuning two races on it would
be fitting noise. To resolve: raise `ARCADE_2V2_PARAMS.seeds` (16+, a baseline re-record with its reason) or use the random-partner
harness (`tools/sim/snag-trap-teams.mts partners`) first, then re-fit echo down and pax up by about 5 percent each.
Hard 1v1 stalemates not examined.
