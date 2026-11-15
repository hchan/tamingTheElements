---
status: idea
added: 2026-11-14
---

# Roster of 24: six heroes per element

Owner idea (2026-11-14): today there are 12 heroes (three per element, four elements). Grow to 24: six per element, with the 12 new elementals created in the same theme (medieval-ish dark fantasy, see [feedback-dark-fantasy-meaning] in memory; luminous, painterly).

## Scope (all of it)

- Design 12 new heroes (3 more each of fire, water, earth, air): names, silhouettes and size class (dragons long, wisps tiny), stats, a signature ability set that does not duplicate existing ones, AI behaviour, personality lines for the hero picker and Help.
- Art per hero: SD-assisted portrait (see the SD portrait rig plan), baked sprite sheets, ability FX, super cut-in, locomotion flags (wings, knees, backward gait).
- Sim: new data in `src/core/data/` (characters, abilities, moves), balance fit, goldens and baselines re-recorded with a stated reason, SIM_VERSION bump. One sim-changing agent at a time.
- UI: hero picker and Tour have to hold 24 (paging or a grid), the 2v2 picker, the menu showcase, phone layout.
- Tests: every hero in the all-heroes coverage tests, balance spread 45-55%, a headless screenshot sheet.

## Staging

Ship in batches (for example 4, then 4, then 4) so `main` stays green and balanced; the Opus planner decides the order and the shared-file plan (`src/core/index.ts`, asset manifest, size-budget.json, docs/REPO-MAP.md).

## Open

- Does the void element count as a fifth type (Eternal Void exists)? The owner said 4 types x 6.
- Which of the existing heroes seed the archetype gaps (tank, rushdown, zoner, grappler, summoner, trapper)?
