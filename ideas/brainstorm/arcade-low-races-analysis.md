---
status: idea
added: 2026-11-12
---
# Why Cyclonius, Lavax and Rokcore are low in Arcade (analysis, SIM_VERSION 35)

Harness: `tools/sim/low-races/lowraces.mts` (`tsx tools/sim/low-races/lowraces.mts 24 3 ~/claudetmp/out.json`), 24 seeds, Normal, round robin.
Not run: `balance:compare`. Per-slot damage labels are approximate (verified for Lavax only); win rates, first-hit times, ability counts and the matrix are solid.

| Race | Win % | Notes |
|---|---|---|
| lavax | 41.3 | first own hit 4.4 s (fast races 1.7 s); deals 942, takes 661 yet loses 59%; 4 stalemate draws; 72% of damage from crimson-fire |
| cyclonius | 42.0 | first hit 3.8 s; deals 1061, takes 986; matchups 0 vs lavax and fiara, 100 vs treenoc |
| rokcore | 45.5 | deals 1110, takes 571 (best ratio) but lands the first hit only 33%; dashes 11.3x per match (others 4-8) |
| pax, treenoc | 56.3 | high end |

- Traps are not the cause (2 to 3% of their damage). No timeouts anywhere. Supers are fired 4.5-4.8x a match and AI uses each kit.
- The matchup matrix is almost all 0 or 100: pairings are decided by element/weather counters or AI personality, so small stat changes move little.
- Not read yet: `scripted-ai/arcade.ts` and `arcade-ai.ts` (is Rokcore's dashing and slow opening in the tactics layer?).

## Proposals (unapplied, untested, ranked)
1. First find what decides the 0/100 matchups (`sim:match --a lavax --b curomo --seeds 20`): element and weather counters vs AI personality.
2. Rokcore: AI attacks before dashing (est. +3 pp).
3. Lavax: `hpPm` 3500 to about 4000 (est. +3 pp; may cut stalemates).
4. Cyclonius: shorter time to first hit (tornado cooldown or first wind-cone), weakest-supported (est. +3 pp).
Any change bumps SIM_VERSION and re-records Arcade baselines with a stated reason.
