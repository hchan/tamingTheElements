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

## Plan (three narrow planners, 2026-11-27; stubs ~/claudetmp/plans/morblass-{1-damage,2-kit,3-options}.md)

Facts: morblass is 1v1 .63 (recorded baseline; two measured blocks .630 and .571); `ARCADE_RACE_NUMBERS.morblass` = [3600 life, 1092 damagePm], 2v2 life factor 842. Damage order in `src/core/sim/systems/arcade/hit.ts`: l112 `pm = sup ? 1000 : arcadeRaceNumbers(attDef.id)[1]` (the only super bypass), l114-115 trap/racePm, l116-117 `computeDamage` (attacker mult, element chart, defence), l119-120 terrain, l122 `charted * racePm / 1000`, l124-126 elemental buff, l128 `* scalePm / 1000` (guard chip / combo scale), l130 `hp -= amount`. Hailstorm (id 11, TIDE shape, `arcade-supers.ts:94`, `SUPER_TIDE_DAMAGE` 150, 6 icicles): only the 150-damage WAVE is unscaled; its icicles are ordinary projectiles that DO take damagePm. Measured kit shares (morblass vs treenoc, 8 seeds, MEASUREMENT): super 43.8%, icicles 19.6%, ice-blast 2.7%, charge 2.5% (the earlier .508/.207/.180 shares mixed both fighters; ground-shock is Pax's). `damagePm` is shared by 1v1/2v2/3v3 (no team-size factor in hit.ts; only life depends on team size via `arcadeLifePm`), so any damage lever also lowers 2v2 (morblass-led .418; floor .40). Past levers: life -8% = -0.8 pp (v120), damagePm -2.5% = ~1 pp (v111): a shared damagePm cut would need ~20%.

Decision (coordinator): lever = a morblass-only SUPER scale (data + 3 lines): `export const ARCADE_SUPER_PM: Readonly<Record<string, number>> = { morblass: <pm> }` and `arcadeSuperPm(slug)` (default 1000) in `arcade-numbers.ts`; `hit.ts:112` becomes `const pm = sup ? arcadeSuperPm(attDef?.id ?? '') : arcadeRaceNumbers(...)[1]`, and make sure l115/l122 apply `racePm` for a super with pm !== 1000 (check the `=== 1000` exact-path guard; integer pm only; Classic never reaches this code). Rejected for now: shared damagePm cut (too weak, hits 2v2), 1v1-only scale (needs a new hashed state field for the roster size), editing ice-blast/icicles in ABILITY_DEFS (shared with Classic: changes Classic goldens). Start value 900 (-10% on the wave only: an ESTIMATE of about -4 to -5% total morblass damage), measure candidates 900 and 800 in a scratch worktree (TTE_MODS has no super key: edit the table in the worktree, one candidate per run).
Acceptance (all MEASUREMENT, one at a time, load1 < 15; 1v1 full baseline ~430 s, 2v2 ~10-15 min estimate): morblass 1v1 two-block mean (seed 1 + seed 41) in .45-.55 (or the largest cut that keeps the 2v2 guard); morblass-led 2v2 >= .40 (guard: stop raising the cut if it fails); no other hero outside .40-.60; cross within 1 pp of .472; stalemates <= 8. If .55 is unreachable without breaking the 2v2 guard, take the largest passing value and move the band excuse down (balance-gate: morblass excused up to 60 instead of 65) with a note.
Version: SIM_VERSION 122, AFTER the Hard AI wall-hold change (v121, `balance-v121-wall-hold-plan.md`): independent changes, separate bumps keep baseline moves attributable. Builder split per the owner's rule: (1) code + tests (arcade-numbers.ts table + accessor, hit.ts, a unit test: morblass super does X dmg at pm 900, a control hero unchanged, Classic untouched; no heavy runs), (2) read-only measure of the candidates (two seed blocks + the 2v2 guard), (3) bump + docs (version.ts, DETERMINISM.md, BALANCE.md), (4) night re-record: `golden:record --ruleset arcade` + `balance:record` 1v1/full + 2v2 baseline (the 2v2 number changes for morblass-led pairs) + `balance:compare` proof, (5) band tests: lower or remove the morblass excuse in `tests/repo/balance-gate.test.ts` (lines ~112-118).
