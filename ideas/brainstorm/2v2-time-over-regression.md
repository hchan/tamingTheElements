---
status: idea
added: 2026-11-13
---

# 2v2 time-over rate regression

After giant heroes slice 2 (SIM_VERSION 45) the Arcade 2v2 time-over rate was 0.101 against about 0.02 earlier. Measured at SIM_VERSION 46
(`pnpm fun:report --ruleset arcade --team-size 2 --all`): 312 rounds, median 80.9 s (p10 57.5 s, p90 115.8 s), time over 10.6 percent, perfects 1.
The same report for 1v1: 302 rounds, median 48.6 s, time over 2.0 percent. So the regression is 2v2 only and the retune (1v1 `ARCADE_RACE_NUMBERS`
only) did not fix it; it is still inside the `tools/ci/fun-gates.json` band (0 to 0.15).

Suspects, not yet checked: the 2v2 life table `ARCADE_2V2_LIFE_PM` was tuned before the size changes (giants and Ishimi's mid-size add life and
cut speed, so a team of two slow, tanky heroes out-lasts the round cap), and the 2v2 baseline spread is wide (Rokcore 22.7 percent, Curomo 73.9).
Next: bisect SIM_VERSION 41..45 with `fun:report --team-size 2`, then re-fit `ARCADE_2V2_LIFE_PM` (data only).
