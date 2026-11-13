---
status: done
added: 2026-11-12
---

**Done 2026-11-13.** `pnpm ability:usage` (`tools/sim/ability-usage.ts`, documented in docs/TESTING.md, tests in `tests/repo/ability-usage.test.ts`). It counts casts from cooldown-deadline rises in `SimState.abil`, buff uptime from the status table, hits and damage from Arcade `hitConfirmed`, per hero and slot, and flags dead and overused abilities. Findings (Arcade, AI level 3, 2 seeds x 66 pairings): no slot is dead; Fire Heal is rare (0.7 casts/min, 1% of Fiara's casts); seven ranged heroes put 85-99% of casts into their one shooter; Curomo's Shards of Ice never scores a hit; buffs sit at 3-6 casts/min with 7-33% uptime. Follow-ups: [ai-heal-and-buff-usage](../brainstorm/ai-heal-and-buff-usage.md), [shards-of-ice-no-hits](../brainstorm/shards-of-ice-no-hits.md), [ranged-primary-spam](../brainstorm/ranged-primary-spam.md), [ability-usage-nightly-gate](../brainstorm/ability-usage-nightly-gate.md). Not done here: Dash, Parry, Weather and Charge are not ability slots (see [dash-parry-weather-usage](../brainstorm/dash-parry-weather-usage.md)), and the Classic AI personality axis ([classic-ai-personality-axis](../brainstorm/classic-ai-personality-axis.md)).

Original note:


# Measure buffs, Dash, Parry, Weather and Charge in the sim runner

From docs/ABILITY-AUDIT.md findings 7 and 9. tools/sim/run-match.ts reports damage per ability only: no events for melee hits, heals or buffs, so Fire Heal, Rock Armour, Adrenaline, Fire Dance, Translucent Flame, Fade, Dash, Parry and Weather cannot be scored. Add per-ability use counts and uptime to the match report and the tournament JSON, and add an AI personality axis so Classic runs vary (Classic scripted results are identical at 2 and 6 seeds). Prerequisite for any buff rebalance. Tooling only (tools/sim), no SIM_VERSION bump.
