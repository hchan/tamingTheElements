---
status: idea
added: 2026-11-16
---

# Balance report across all 24 heroes after roster24 release

Goal: once roster24 ships, run `pnpm sim:match --tournament --json` and `pnpm balance:compare` across all 24 heroes in 1v1 and 2v2, report per-hero win rates and outliers, and file follow-up ideas (no silent retuning).

Why: the baseline only covers the original 12 ([balance-outliers](balance-outliers.md)).

- Size: M.
- Dependencies: roster24 released ([roster-24-heroes](../in-progress/roster-24-heroes.md), hidden until owner approval); retuning needs a SIM_VERSION bump, golden and baseline re-record with a stated reason, one agent at a time.
- GPU-suitable: no.
- Owner-gated: no for the report; yes for any change to released heroes.

## Progress note (2026-11-24, balance-24 round R3, SIM_VERSION 111)

Legacy ranged damagePm -2.5% (morblass 1120 -> 1092, cyclonius 1100 -> 1072, lavax 870 -> 848), Arcade numbers only; Classic baseline.json delta 0.0. Measurements (aiLevel 3, 16 seeds), seed 1 = fixtures, seed 41 = `sim:match --tournament --seed 41`: see docs/BALANCE.md "Arcade legacy ranged damage re-fit (SIM_VERSION 111)". Plan: `.scratch/plans/balance-24-tuning.md`. Next: R2/R4 per the plan, one sim agent at a time.
