# Balance tooling

`pnpm sim:match` (`tools/sim/run-match.ts`, run via `tsx`) plays headless AI-vs-AI matches on the deterministic sim: no Phaser, no DOM.

## Single pairing

```
pnpm sim:match --a fiara --b curomo --agents scripted,random --seeds 20 --level 5 --difficulty 1 [--json]
```

- `--a`, `--b`: one of the 12 playable races (the dummy target and Eternal Void are excluded).
- `--agents <x>[,<y>]`: `scripted` (the `AttackAgent` port of the legacy attack decisions plus melee chase and situational use of buffs, heals and omni fans, see the port-gap audit below) or `random` (`RandomBot`). One value applies to both sides; two are for `a` and `b`.
- `--seeds N` matches, seeded from `--seed S` (default 1) through `matchSeed(S, i)`, so a run is reproducible. Odd seeds swap which side is team 0, so the difficulty handicap and any side bias cancel.
- `--level L` sets both sides' level (via XP), `--difficulty D` the player-side divisor (default 1), `--max-ticks` (default 9000, a timeout) and `--stalemate-ticks` (default 1500: no HP change on either side ends the match as a stalemate).
- Per-match metrics: winner, end reason (`ko`, `timeout`, `stalemate`), ticks, damage per ability. The summary adds the win rate of `a` (draws count half) with a Wilson 95% CI, mean ticks, end-reason counts and each ability's damage share.
- Damage of projectile abilities comes from the sim's `damage` events. The sim emits no events for melee hits and damage over time, so those are an approximate `melee-or-status` bucket derived from per-tick HP drops.

## Tournament

```
pnpm sim:match --tournament --seeds 4 [--agents scripted,scripted] [--json]
```

Round robin over all 66 unordered pairs of the 12 races, `--seeds` matches each. Output: a race ranking (score = wins + half draws over games) and a 4x4 element matchup matrix (fire, air, earth, water; win rate of the row element against the column element). `--json` also lists every pairing summary.

## Regression gate

Two tiers, both deterministic (scripted bots, fixed seeds), so any change in the numbers comes from a sim, data or bot change.

- **PR sample** (`tests/repo/balance-gate.test.ts`, about 5 s, part of `pnpm test`): all 66 pairings, 2 seeds, level 1, scripted vs scripted, 9000-tick cap. Hard invariants only: no match times out, stalemates are at most 10% of matches (full tournament: 0 of 1056 since the Classic walls hold y as in legacy, WP-parity-fixes; 48 before), results are identical when re-run, every ability of every race is cast at least once (cooldown booked, each race against all others), and no race sits at 0% or 100% win rate except the explicit allowlist `KNOWN_OUTLIERS` (sindarosa 100%, ishimi 0%, the legacy-numbers outliers under "Remaining skew"). It never asserts win-rate values.
- **Nightly full** (`.github/workflows/nightly.yml`, schedule plus `workflow_dispatch`): `pnpm balance:compare` plays the full tournament and diffs it against `tests/fixtures/balance/baseline.json`; it also runs `pnpm test` with `SIM_FUZZ_RUNS=500 SIM_FUZZ_TICKS=1500` (see `docs/TESTING.md`). The JSON report (`out/balance-report.json`: baseline, current, per-race deltas) is uploaded as the `balance-report` artifact.

Baseline parameters (`FULL_PARAMS` in `tools/sim/balance.ts`): 66 pairings x 16 seeds = 1056 matches, `--seed 1`, level 1, difficulty 1, scripted vs scripted, max 9000 ticks, stalemate after 1500 ticks without an HP change. It stores per-race win rates, total stalemates and timeouts.

`pnpm balance:compare [--out file] [--tolerance 0.05]` prints per-race baseline, current and delta, and exits 1 when any race moves by more than 5 percentage points (or a race is added or removed). Intentional sim, data or bot changes re-record the baseline with `pnpm balance:record` and say why in the commit message; reviewers read the baseline diff as the balance change.

## Speed

Measured on a laptop: roughly 20k ticks/s with random bots (cold start included) and 100k+ ticks/s with scripted bots. The full 12-race tournament at 2 seeds (132 matches) runs in under a second. `tests/repo/sim-match.test.ts` benchmarks the runner with a generous bound of 5000 ticks/s so slow CI does not flake.

## Port-gap audit

Why the first tournament (`pnpm sim:match --tournament`, 4 seeds, level 1, scripted vs scripted) was so skewed, and what was fixed. The probe is `src/core/sim/ability-probe.ts` (guarded by `ability-probe.test.ts`): caster at 50 hp vs an idle 10000 hp dummy 100 px away (150 ticks, slot held), plus one dummy Stick (10 dmg) fired at the caster after it presses the slot. Legacy references: `tests/fixtures/legacy/abilities-range.json`, `abilities-effects.json`, `data.json`.

Classes: (a) real port gap, fixed; (b) bot limitation, improved; (c) legacy imbalance, kept.

### Ability x fires? x effect

"Before" is main at the start of the audit, "after" is this branch. Effect is over the 150-tick probe window unless stated.

| Race | Slot | Ability | Fires before | Fires after | Effect after (evidence) | Class |
|---|---|---|---|---|---|---|
| curomo | 0 | ice-shock | yes | yes | 3 casts x 20 = 60 dmg | - |
| curomo | 1 | shards-of-ice | yes, every tick (1280 dmg) | yes, once per 10 s | one fan, 20 dmg per bullet that hits (abilities-range `canFireAtCooldown` 10000 false / 10001 true) | (a) omni cooldown |
| cyclonius | 0 | tornado | yes | yes | target frozen, 0 dmg (`tornado` fixture) | - |
| cyclonius | 1 | wind-cone | yes | yes | 91 dmg | - |
| echo | 0 | fade | NO | yes | translucent, incoming Stick 10 -> 0 (`translucency:Fade`) | (a) buffs not cast |
| echo | 1 | hurricane | yes | yes | 25.59 dmg = 13 + 6.5 + 3.25 + ... (`hurricane` fixture halving) | - |
| eternal-void | 0 | chaos-bolt | yes | yes | 200 dmg | - |
| eternal-void | 1 | chaos-orb | yes | yes | 140 dmg | - |
| fiara | 0 | fire-heal | NO | yes | heal 10 x healMult, capped at max (`fireHeal` table) | (a) |
| fiara | 1 | fireball | yes | yes | 21 dmg (grows 0.25x -> 1.02x per step) | - |
| ishimi | 0 | circus-of-slime | yes, every tick (592 dmg) | yes, once per 10 s | 48 dmg | (a) omni cooldown |
| ishimi | 1 | slime-blast | yes | yes | 2 x 10 = 20 dmg | - |
| lavax | 0 | crimson-fire | yes | yes | 91 dmg | - |
| lavax | 1 | fire-dance | NO | yes | speed +2 for 5 s (`fireDance` fixture) | (a) |
| morblass | 0 | ice-blast | NO | yes | 15 dmg, speed -2 clamped to half base on the 0.2-speed dummy (`iceBlast:clamps`) | (a) kind `debuff` rejected by the projectile system; 60x60 px size scaled as a fraction (4800 px) |
| morblass | 1 | icicles | yes | yes | 90 dmg | - |
| pax | 0 | adrenaline | NO | yes | speed +5, incoming Stick 10 -> 7.5 (`adrenaline` fixture) | (a) |
| pax | 1 | ground-shock | yes | yes | 25 dmg | - |
| rokcore | 0 | rock-armour | NO | yes | incoming Stick 10 -> 2.5 (`rockArmour` fixture, 75%) | (a) |
| rokcore | 1 | rock-pellet | yes | yes | 140 dmg | - |
| sindarosa | 0 | fire-blast | yes | yes | 200 dmg | - |
| sindarosa | 1 | translucent-flame | NO | yes | translucent for 1.5 s, Stick 10 -> 0 | (a) |
| treenoc | 0 | entangling-vines | yes | yes | target frozen (`vines` fixture) | - |
| treenoc | 1 | strangling-branches | yes | yes | 3 x 20 = 60 dmg | - |
| wispera | 0 | sonar-blast | yes | yes | 174 dmg (decays 0.98 per step) | - |
| wispera | 1 | steal-health | yes | yes | 30 dmg, caster +30 (`stealHealth` fixture) | - |

Also fixed under (a): Adrenaline and Rock Armour changed speed only, because projectile and melee hits passed `defReductionPct: 0`; they now use `damageDecreasePct` of the victim (legacy `applyDamage` tail).

### Findings by class

- (a) Real port gaps, all fixed in `src/core/sim`: the `abilities` system slot was a no-op, so no buff or heal ever fired (`systems/abilities.ts`); damage decrease ignored; Ice Blast never fired and its bullet size was wrong; omni abilities had no cooldown. Legacy quirk kept and recorded in `docs/legacy/KNOWN-BUGS.md` (`omni-no-cooldown`: no `curCount` / `maxActive` for omni, but `doAbility` sets `lastUsed`, so the cooldown holds in play).
- (b) Bot limitations, improved in `tools/sim/run-match.ts` (`ScriptedAI`): buffs, heals and omni fans were used on cooldown or never; melee races stopped at 80% of their melee reach, but the legacy `isInRange` quirk (`KNOWN-BUG:melee-range-axes`) only accepts a melee within about 40 px, so they never struck. Defensive buffs now wait for a lined-up opponent in range, heals fire below 60% health, melee races approach off the firing line and then close in.
- (c) Genuine legacy imbalance: raw damage output in `data.json` (damage / cooldown, sustained): Fire Blast 40/600 ms (67/s, Sindarosa) and Sonar Blast 40/600 ms (67/s, Wispera) against Slime Blast 10/1500 ms (7/s, Ishimi), Ground Shock 25/3000 ms (8/s, Pax), Hurricane 13 halving per hit (Echo). Bots never dodge, so the highest sustained ranged damage wins.

### Tournament win rates

Same command and seeds before and after (66 pairings x 4 seeds, 22 games per race; deterministic bots, so 8 seeds gives the same numbers).

| Race | Element | Before | After |
|---|---|---|---|
| sindarosa | fire | 82% | 100% |
| rokcore | earth | 55% | 82% |
| wispera | air | 64% | 82% |
| cyclonius | air | 73% | 77% |
| curomo | water | 96% | 46% |
| lavax | fire | 36% | 46% |
| morblass | water | 46% | 46% |
| pax | earth | 27% | 46% |
| fiara | fire | 18% | 32% |
| treenoc | earth | 9% | 27% |
| echo | air | 0% | 18% |
| ishimi | water | 96% | 0% |

### Remaining skew

The 96% outliers (Curomo, Ishimi) were the omni cooldown gap and are gone. What is left is mostly class (c) plus bot limits: Sindarosa (100%) and Wispera, Rokcore, Cyclonius lead on sustained ranged damage; Ishimi (0%) has the weakest damage in `data.json` and its Circus of Slime is slow (speed 5, one fan per 10 s); Echo and Treenoc rely on abilities (Hurricane, Vines) whose payoff needs a human to combine them. The scripted agents still do not dodge, retreat or use the Capture/Swap mechanics, and the sim emits no events for melee hits, heals and buffs, so the tournament damage shares are approximate. No further data changes were made: balance values are legacy and need design approval.
