---
status: idea
added: 2026-11-12
---
# Rokcore giant life readout (365 vs Pax 795): by design, make it visible

Checked after the giant-heroes merge (SIM_VERSION 41). `balance:compare` (Classic, `--ruleset arcade`, `--ruleset arcade --team-size 2`) all show +0.0pp vs the committed baselines, because the giant commit re-recorded the Arcade baselines itself and Classic ignores size.

The screenshot numbers are not a bug: Rokcore maxHp = floor(floor(120 * 2100 / 1000) * 1450 / 1000) = 252 * 1.45 = 365; Pax = 150 * 5300 / 1000 = 795. The x1.45 is correct, but `ARCADE_RACE_NUMBERS.rokcore` hpPm was cut 2600 -> 2100 in the same commit, so net life only rose from 312 to 365 (x1.17), not x1.45. Rokcore stays the lowest-life hero by design (strongest kit, 75% Rock Armour).

Open: players see a 2x body with less than half Pax's life; consider a life bar scaled to body size or a short tutorial hint. Not changed (design call).
