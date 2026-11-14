---
status: done
added: 2026-11-14
---
# Arcade balance after the x3 supers (SIM_VERSION 53)

Data-only life (`hpPm`, `ARCADE_RACE_NUMBERS`) retune; damage untouched so super payoff (about 30 percent of foe life) is unchanged.
`pnpm balance:compare --ruleset arcade`, 16 seeds, Normal (spread 39.2-58.0 before, 44.9-54.0 after).

| Race | hpPm before -> after | Win % before | Win % after |
|---|---|---|---|
| curomo | 5780 -> 5450 | 56.3 | 51.1 |
| cyclonius | 5090 -> 5600 | 39.2 | 47.2 |
| echo | 6330 -> 6500 | 47.2 | 44.9 |
| fiara | 5230 -> 4600 | 58.0 | 53.4 |
| ishimi | 4800 -> 5000 | 42.6 | 48.3 |
| lavax | 4000 | 45.5 | 48.9 |
| morblass | 4100 | 54.0 | 52.3 |
| pax | 5100 -> 4850 | 58.0 | 54.0 |
| rokcore | 2060 -> 1850 | 58.0 | 52.8 |
| sindarosa | 2720 | 45.5 | 47.2 |
| treenoc | 6350 | 50.6 | 50.6 |
| wispera | 7550 -> 7850 | 45.5 | 49.4 |

Steps are steep and noisy (16 seeds, about 2-3 pp). No stalemates or timeouts.
