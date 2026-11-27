---
status: idea
added: 2026-11-27
---

# Morblass is above the 1v1 Arcade band: super-damage scaling (needs an Opus plan)

After SIM_VERSION 120 morblass is the only hero outside .45-.55 (recorded 1v1 baseline .63, two-block mean .6005; the band test excuses it up to .65). Background: [balance-v120-plan](../done/balance-v120-plan.md).

## Evidence
- Life is a weak lever: .614 at -8% life only moved to .606 (measurement, M1 seed 1), so v120 left morblass at its v119 life (3600, 2v2 factor 842).
- Supers are about half its damage (pax vs morblass, 16 seeds: super .508, icicles .207, ground-shock .180, charge .036) and `damagePm` does not scale them (`src/core/sim/systems/arcade/hit.ts:112` reads `arcadeRaceNumbers(attDef?.id)[1]` with no team-size or ruleset factor).

## Options (to be costed by the plan)
1. A shared `damagePm` cut for morblass, with a 2v2/3v3 measurement (it also changes team play, where morblass-led pairs sit at .418).
2. Team-size damage compensation in `hit.ts` (a new sim mechanism) so a 1v1 cut leaves 2v2/3v3 bit-identical.
3. A morblass super-damage scale (new code).

Needs an Opus plan (sim change, goldens and baselines re-record, SIM_VERSION bump).
