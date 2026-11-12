# Balance tooling

`pnpm sim:match` (`tools/sim/run-match.ts`, run via `tsx`) plays headless AI-vs-AI matches on the deterministic sim: no Phaser, no DOM.

## Single pairing

```
pnpm sim:match --a fiara --b curomo --agents scripted,random --seeds 20 --level 5 --difficulty 1 [--json]
```

- `--a`, `--b`: one of the 12 playable races (the dummy target and Eternal Void are excluded).
- `--agents <x>[,<y>]`: `scripted` (the `AttackAgent` port of the legacy attack decisions plus melee chase and situational use of buffs, heals and omni fans, see the port-gap audit below) or `random` (`RandomBot`). One value applies to both sides; two are for `a` and `b`.
- `--no-traps` (Arcade only): masks the Trap command bit (`Cmd.trap`) from every agent, for trap ablations (`tools/sim/trap-ablation/trapstats.mts` reuses `withoutTraps` with `NOTRAP=1`). Arcade trap hits appear in `damageByAbility` as `trap-bomb` and `trap-spike`.
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

`pnpm balance:compare [--ruleset classic|arcade] [--out file] [--tolerance 0.05]` prints per-race baseline, current and delta, and exits 1 when any race moves by more than 5 percentage points (or a race is added or removed). Intentional sim, data or bot changes re-record the baseline with `pnpm balance:record` and say why in the commit message; reviewers read the baseline diff as the balance change.

## Arcade numbers

The Arcade ruleset ([FUN-DESIGN.md](FUN-DESIGN.md) section 2.13, WP-arcade-numbers) has its own per-race life and damage
(`ARCADE_RACE_NUMBERS` in `src/core/sim/arcade-numbers.ts`), tuned on the Arcade round robin; Classic data is untouched.

- `pnpm balance:compare --ruleset arcade` and `pnpm balance:record --ruleset arcade` play `ARCADE_PARAMS` (`tools/sim/balance.ts`):
  the same 66 pairings x 16 seeds, under `rulesetArcade`, scripted Arcade AI at Normal (`aiLevel` 3) with its personality
  drawn per match, an 18000-tick tooling cap (`ARCADE_MAX_TICKS`: a best of 3 always ends by its round timers, but three
  long rounds outlast 9000) and the same stalemate rule. Baseline: `tests/fixtures/balance/arcade-baseline.json`, compared
  with the same 5 pp tolerance. The nightly runs it and `pnpm fun:report --ruleset arcade --all --seeds 8` REPORT ONLY
  (`continue-on-error`) and uploads both reports; the Classic compare still fails the job. `fun:report` prints per-race win
  rates and the WP-arcade-numbers bands (round median 25-60 s, time over at most 15%, stalemates 0, first hit at most 4 s,
  combo median 2-4 and p90 at most 8, every race 35-65% with `--all`) as `ok` or `OUT`, never as a failure.
- `pnpm sim:match` and `fun:report` use `ARCADE_MAX_TICKS` for Arcade matches unless `--max-ticks` is given.

Win rates (draws count half), before (main at SIM_VERSION 16, 8 seeds) and after (the 16-seed baseline):

| Race | hpPm | damagePm | Before | After |
|---|---|---|---|---|
| curomo | 6140 | 1420 | 39.2% | 50.6% |
| cyclonius | 4490 | 1010 | 52.3% | 50.6% |
| echo | 6360 | 1840 | 23.9% | 47.2% |
| fiara | 5140 | 1750 | 48.9% | 46.9% |
| ishimi | 6180 | 1550 | 32.4% | 57.1% |
| lavax | 3320 | 870 | 56.8% | 53.1% |
| morblass | 3370 | 930 | 80.7% | 45.5% |
| pax | 5870 | 1580 | 9.1% | 50.9% |
| rokcore | 2470 | 690 | 86.9% | 43.2% |
| sindarosa | 2620 | 650 | 70.5% | 50.0% |
| treenoc | 8470 | 1640 | 24.4% | 56.8% |
| wispera | 3490 | 800 | 75.0% | 48.3% |

Spread (best minus worst) 77.8 pp before, 13.9 pp after (15.9 pp on the 8-seed `fun:report`); at AI
Hard (8 seeds) 23.9 pp (39.8-63.6%), at Easy 71.6 pp (not tuned: no supers, combo cap 1). The fun numbers before and after are in FUN-DESIGN section 2.13.

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

## Arcade stage terrain (WP-arcade-terrain, SIM_VERSION 21)

The stage patches of FUN-DESIGN 2.15 changed Arcade play (Classic baseline unchanged, +0.0pp for every race), so the Arcade
baseline `tests/fixtures/balance/arcade-baseline.json` was re-recorded. Arcade win rates (`pnpm balance:compare --ruleset
arcade`, 66 pairings x 16 seeds) went from min 43.2 percent (Echo) and max 54.8 (Lavax) to min 45.5 (Echo) and max 54.3
(Ishimi); the largest single move was Curomo -3.9pp and Wispera +3.7pp. `pnpm fun:report --ruleset arcade --all --seeds 8`: race
win rates 40.9 (Echo) to 57.4 (Ishimi), the round median 46.0 s. Stalemates first rose from 4 to 92 of 1056 matches (an earth stage puts a rock on the
fighters' row); the Arcade AI's rock avoidance (`ArcadeTactics.slide`) brought them to 7, and the baseline was re-recorded
with it: win rates min 43.2 (Echo) and max 56.0 (Ishimi). No data row was retuned.

## Arcade 2v2 tune (WP-arcade-2v2-tune, SIM_VERSION 22)

`pnpm fun:report --ruleset arcade --team-size 2 --all --seeds 8` (fixed partner per race, `RACES[(i + 6) % 12]`, Normal AI,
personalities on) before and after. Levers: a per-race 2v2 life multiplier (`ARCADE_2V2_LIFE_PM` in
`src/core/sim/arcade-numbers.ts`, default 600 pm of the 1v1 Arcade life, applied only to two-hero rosters), bench heal
`REST_HEAL_PM` 10 -> 3 pm per 10 ticks, and the Arcade AI of a tag team firing along a rock-cut line from tick 64 of every
256 (`SHOOT_FROM`; two sides that both refused a wasted shot and slid about never traded a hit).

| 2v2 metric | before | after (seeds 41/51/61/71, 8 each) | target |
|---|---|---|---|
| rounds ending by time over | 74.6% | 3.7-5.1% | under 15% |
| round length median (`W.tick`, includes freezes) | 123.4 s | 75-77 s | 45-90 s |
| matches ending in a stalemate | 0% | 1.3-1.9% | at most 1% (not met; the baseline has 2 of 528) |
| race win rate spread (one 88-match sample per race) | not measured | 36-61% per fresh seed | 40-60% |

The recorded 2v2 baseline `tests/fixtures/balance/arcade-2v2-baseline.json` (`pnpm balance:record --ruleset arcade
--team-size 2`, 66 pairings x 8 seeds, 2 stalemates) has race win rates 40.9 (Pax) to 59.1 (Wispera). It is new in this WP: the
tune changed 2v2 play, there was no 2v2 baseline before. `pnpm balance:compare --ruleset arcade --team-size 2` diffs it (report
only, 5 pp tolerance). Seed noise is about 5 pp per race, so single fresh seeds reach 36-61%. The 1v1 Arcade baseline and the
Classic baseline are unchanged (+0.0pp every race); the Arcade goldens were re-recorded (new sim version, 2v2 life, heal and AI).

## Current Arcade state (SIM_VERSION 38 tables; sim is at 41)

Later versions: 39 added the elemental ability (baselines re-recorded), 40 changed the 2v2/3v3 life table (`ARCADE_2V2_LIFE_PM` lavax 900, wispera 700) and 41 added giant heroes (Rokcore at 2x, hpPm 2100 / damagePm 650 plus the size bonus; see FUN-DESIGN 2.25). The rows below are the SIM_VERSION 38 snapshot; `pnpm balance:compare` against `tests/fixtures/balance` is the current truth.


The two tables above are the history of the first tune and the 2v2 tune; later work packages (Snag, the smarter AI, the 1920 field, traps, hpPm retunes in SIM_VERSION 27, 30, 31, 36, 37 and the AI round-reset fix in 38) re-fit the rows and re-recorded both baselines. Today's `ARCADE_RACE_NUMBERS` and the recorded baselines (`tests/fixtures/balance/arcade-baseline.json`: 1056 matches, 14 stalemates; `arcade-2v2-baseline.json`: 528 matches, 9 stalemates, 36000-tick cap):

| Race | hpPm | damagePm | 1v1 win rate | 2v2 win rate |
|---|---|---|---|---|
| curomo | 5800 | 1200 | 44.3% | 77.3% |
| cyclonius | 5000 | 1080 | 48.9% | 23.9% |
| echo | 6200 | 1600 | 43.8% | 40.9% |
| fiara | 5400 | 1520 | 52.0% | 54.0% |
| ishimi | 6400 | 1550 | 51.1% | 48.9% |
| lavax | 4000 | 870 | 48.6% | 60.2% |
| morblass | 3950 | 1070 | 52.3% | 67.0% |
| pax | 5300 | 1580 | 54.0% | 25.6% |
| rokcore | 2600 | 690 | 46.0% | 34.7% |
| sindarosa | 2620 | 650 | 50.0% | 59.1% |
| treenoc | 6500 | 1270 | 55.7% | 49.4% |
| wispera | 7300 | 1280 | 53.4% | 59.1% |

The 1v1 spread is 11.9 pp (43.8-55.7%). The 2v2 spread is 53.4 pp (23.9-77.3%): the 2v2 life factors (`ARCADE_2V2_LIFE_PM`) have not been re-fit since the 1v1 numbers moved, and the 2v2 baseline was recorded with those outliers accepted (see the SIM_VERSION 28 commit). The 2v2 and 3v3 tournaments pair each race with a fixed partner (the race half, or a third and two thirds, of the list on); `tools/sim/snag-trap-teams.mts partners` plays random partners instead (the random-partner harness).
