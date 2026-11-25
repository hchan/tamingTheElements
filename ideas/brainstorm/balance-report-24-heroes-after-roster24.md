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

## Progress note (2026-11-24, balance-24 round R4, SIM_VERSION 112)

Legacy melee 1v1 life about +3% (wispera 6833 -> 7041, echo 7250 -> 7464, pax 4540 -> 4677) with 2v2 offsets keeping team life (689, 680, 628); Arcade numbers only; Classic baseline.json and arcade-2v2-baseline.json delta 0.0. Measurements seed 1 / 41 (12 roster, full roster): wispera .460->.483 / .483->.500, .418->.451 / .435->.465; echo .506->.545 / .477->.528, .399->.424 / .399->.429; pax .511->.528 / .528->.511, .370->.408 / .389->.394. See docs/BALANCE.md "Arcade legacy melee life re-fit".

## Progress note (2026-11-25, balance-24 round R5, SIM_VERSION 114)

Arcade outlier re-fit in one round: sindarosa life -6.5%, fiara 1v1 life -6.06% (team life kept), curomo life +8.5%, treenoc damage +10%. 1v1 (16 seeds, released roster): sindarosa .630 -> .579, fiara .611 -> .573, treenoc .383 -> .492, curomo .359 -> .454; 2v2: abyssor-led .668 -> .630, curomo-led .332 -> .486. All heroes now inside both bounds (lowest 1v1 brazgor .405, lowest 2v2 kindrel .421, highest 2v2 abyssor .630). Open: seed-41 hold-out, legacy-roster and 3v3 views were not measured; brazgor is 1 win above the 1v1 limit.
