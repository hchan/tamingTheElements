---
status: idea
added: 2026-11-15
---

# Hard skew still 0.92; rocks wall off big heroes

SIM 82/83 fixed the Hard stalemates (3 -> 0) but not the melee-vs-ranged skew (0.911 -> 0.921, spread 68pp). Defence fatigue is not the lever: every variant landed at 0.908-0.923.

- Next levers to probe: ranged kiting rules and approach pressure for melee at Hard, super use, spacing targets.
- S4 (needs a design call): `TERRAIN_GAP` 80 walls off big heroes (Hyalia 43.2%, Abyssor 33.0%, Brazgor 25.0%, Ishimi/Vortigal 13.6%). A terrain-layout rule so the largest hero reaches every other would change the sim for all levels.
- Not run: `fun:gates` and `ai:duel --ai-level 4` against SIM 81; docs (FUN-DESIGN 2.11/2.15, BALANCE.md) not updated.
- Normal still has 1 stalemate (hyalia-glimmaw), Easy 2.
