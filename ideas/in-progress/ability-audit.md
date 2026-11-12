---
status: in-progress
added: 2026-11-12
---

# Audit every ability for graphics and balance

Owner request 2026-11-12: the abilities of everything must be studied closely and evaluated for graphics and balance.

Plan (one agent at a time, read-only first):
1. Inventory: list every ability of every hero (`src/core/data/abilities-a.ts`, `abilities-b.ts`, Super, Weather, Charge, Dash, Guard, Snag) with kind, damage, range, cooldown, cost, element, sprite and effect.
2. Graphics: for each, a real-game screenshot (and a short frame strip) at game size on each arena floor; score readability (can the opponent see it and its danger zone?), silhouette, contrast with the floor, hit and impact feedback, telegraph before the hit, consistency with Fiara's rigged look. Curomo's ice-shock is the known bad case (see curomo-ability-visibility).
3. Balance: damage per second, effective range, startup and recovery, cost-to-payoff, counterplay, matchup table from `pnpm sim:match --tournament --json` and `balance:compare`; flag outliers (see balance-outliers) and dominated or useless abilities.
4. Output: a table in docs (one row per ability: graphics score, balance score, proposed fix), and one idea file per fix. Balance changes to Classic stay behind the golden and baseline rules; Arcade changes need design approval, a SIM_VERSION bump and golden re-recording with a stated reason.
