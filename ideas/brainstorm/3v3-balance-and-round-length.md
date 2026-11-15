---
status: idea
added: 2026-11-15
---

# 3v3 balance and round length

At SIM_VERSION 77 (measured by the FG-RL planner, legacy 12, 4 seeds, 264 matches, report only) Arcade 3v3 race win rates span 0.114-0.750, the round median is 65 s with 4.2% time-overs, and there is no fun gate for 3v3.

Decide: add 3v3 bands to `tools/ci/fun-gates.json`, retune the 3v3 life table (it shares `ARCADE_2V2_LIFE_PM`), and look at the wide race spread. Needs the sim slot. Do not scale 3v3 life by 1.3: that gives a 100.8 s median and 28.7% time-overs.
