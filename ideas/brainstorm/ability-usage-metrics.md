---
status: idea
added: 2026-11-12
---

# Measure buffs, Dash, Parry, Weather and Charge in the sim runner

From docs/ABILITY-AUDIT.md findings 7 and 9. tools/sim/run-match.ts reports damage per ability only: no events for melee hits, heals or buffs, so Fire Heal, Rock Armour, Adrenaline, Fire Dance, Translucent Flame, Fade, Dash, Parry and Weather cannot be scored. Add per-ability use counts and uptime to the match report and the tournament JSON, and add an AI personality axis so Classic runs vary (Classic scripted results are identical at 2 and 6 seeds). Prerequisite for any buff rebalance. Tooling only (tools/sim), no SIM_VERSION bump.
