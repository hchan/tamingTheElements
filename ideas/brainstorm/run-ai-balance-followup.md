---
status: idea
added: 2026-11-18
---

# Run AI balance follow-up (after RUN-3)

The AI now uses Run Away / Run Towards (SIM_VERSION 89). With the AI's Run disabled the compares matched the old baselines exactly, so every shift comes from the AI using Run.

- Arcade 1v1: pax -6.3pp (over the 5pp tolerance); melee vs ranged 49.5% -> 45.4%.
- Arcade 2v2 (8 seeds, noisy): morblass +11.3, rokcore -13.7, treenoc +9.1.
- Pinned Normal stalemate seed `hyalia|abyssor|2864583637` now stalls; added to RESIDUAL in tests/repo/arcade-stale-seeds.test.ts (Hard still KOs).
- Baselines re-recorded with this reason. Options: tune `ARCADE_AI_RUN_*` and `RUN_*_SPEED_PM`, make Run rarer for melee, re-run 2v2 with more seeds.
