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
- **Nightly full** (`.github/workflows/nightly.yml`, manual `workflow_dispatch` only since 2026-11-17; run the commands locally): `pnpm balance:compare` plays the full tournament and diffs it against `tests/fixtures/balance/baseline.json`; it also runs `pnpm test` with `SIM_FUZZ_RUNS=500 SIM_FUZZ_TICKS=1500` (see `docs/TESTING.md`). The JSON report (`out/balance-report.json`: baseline, current, per-race deltas) is uploaded as the `balance-report` artifact.

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

SIM_VERSION 60 retuned two 2v2 life factors from the 32-seed random-partner run (`partners 2 32`): `ARCADE_2V2_LIFE_PM` curomo 768 (was 800), sindarosa 812 (was 773); team win rate over every roster curomo 59.2 to 57.2, sindarosa 42.6 to 46.4 (ideas/brainstorm/balance-2v2-echo-pax-r37.md).

SIM_VERSION 61 (step 2) retuned two more: `ARCADE_2V2_LIFE_PM` pax 594 (was 612), ishimi 671 (was 633); `partners 2 32` team win rate over every roster pax 59.4 to 54.7, ishimi 39.2 to 41.6 (others moved at most 2.7 pp).

SIM_VERSION 62 (step 3) retuned two more: `ARCADE_2V2_LIFE_PM` treenoc 680 (was 715), wispera 640 (was 600); `partners 2 32` team win rate over every roster treenoc 57.6 to 51.8, wispera 42.6 to 48.8 (others moved at most 2.1 pp; curomo 57.8, cyclonius 43.6, ishimi 40.6 still outside 45-55).

SIM_VERSION 63 (step 4) retuned two more: `ARCADE_2V2_LIFE_PM` curomo 736 (was 768), ishimi 720 (was 671); `partners 2 32` team win rate over every roster curomo 57.8 to 53.2, ishimi 40.6 to 48.6 (cyclonius 40.9, sindarosa 45.4, pax 55.7 still outside 45-55).

SIM_VERSION 64 (step 5) retuned two more: `ARCADE_2V2_LIFE_PM` cyclonius 843 (was 788), pax 575 (was 594); `partners 2 32` team win rate over every roster cyclonius 40.9 to 50.7, pax 55.7 to 53.3 (only sindarosa 44.1 is now outside 45-55).

SIM_VERSION 65 (step 6) retuned one race: `ARCADE_2V2_LIFE_PM` sindarosa 845 (was 812); `partners 2 32` team win rate over every roster sindarosa 44.1 to 47.5, all twelve races now inside 45-55 (lowest ishimi 47.7, highest pax 54.3).

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

### SIM_VERSION 46 retune (after giant heroes slice 2)

Data only (`ARCADE_RACE_NUMBERS`), Arcade 1v1 tournament (`balance:compare --ruleset arcade`, 66 pairings x 16 seeds). Damped power steps (about
`(0.5 / winRate) ^ 0.6`, split between life and damage), then a few nudges because the win rates are noisy at this size. Rokcore also moved
from the giant-adjusted 2100 / 650 to 2060 / 640; Echo 6200 / 1600 and Treenoc 6500 / 1270 were fine-tuned.

| Race | hpPm / damagePm before | after | 1v1 win rate before | after |
|---|---|---|---|---|
| pax | 5300 / 1580 | 5100 / 1520 | 63.6% | 52.3% |
| wispera | 7300 / 1280 | 7550 / 1335 | 37.5% | 48.9% |
| sindarosa | 2620 / 650 | 2720 / 675 | 40.3% | 50.6% |
| cyclonius | 5000 / 1080 | 5090 / 1100 | 44.3% | 50.6% |
| fiara | 5400 / 1520 | 5230 / 1470 | 58.0% | 51.1% |
| curomo | 5800 / 1200 | 5780 / 1195 | 54.5% | 48.9% |
| echo | 6200 / 1600 | 6330 / 1630 | 48.3% | 46.6% |
| morblass | 3950 / 1070 | 4100 / 1110 | 49.4% | 51.7% |
| treenoc | 6500 / 1270 | 6350 / 1240 | 52.3% | 50.0% |
| rokcore | 2100 / 650 | 2060 / 640 | 52.3% | 52.8% |
| lavax, ishimi | unchanged | | 50.0%, 49.4% | 50.0%, 46.6% |

Spread 46.6-52.8% (was 37.5-63.6%). The 2v2 baseline was re-recorded too (it moves with the 1v1 numbers; its spread is unchanged in character, see
above). 2v2 time-over rate 10.6% (1v1 2.0%): ideas/in-progress/2v2-time-over-regression.md.

## Arcade movement feel (SIM_VERSION 66)

Reason for the re-record: Arcade heroes now accelerate, brake and turn (walk inertia), the dash follows a front-loaded curve, a press from dash tick 10
cancels into the attack, and walls slide (FUN-DESIGN 2.3a). Classic is unchanged. Measured with `tools/sim/move-probe.ts` (Fiara):

| | before | after |
|---|---|---|
| walk px per tick from standing | 7, 7, 7, 7 | 2.45, 4.9, 7, 7 |
| stop after release | instant | slides about 3 ticks |
| dash distance | 252 px | 253 px (fast start, slow tail) |
| reversal dx over 3 ticks | -21 | -14.35 |

The extra commitment shifted the races, so `ARCADE_RACE_NUMBERS` and `ARCADE_2V2_LIFE_PM` were nudged and the Arcade goldens and both baselines
re-recorded. Arcade 1v1 win rates 47.2-53.4%, no stalemates, no timeouts. Arcade 2v2 is noisy (88 matches per race, +-5-8 points): roughly 38-69%,
the old baseline was 43.2-61.4% and cyclonius was already high; follow-up in ideas/. The scripted AI still walks, dashes and dodges.

## Arcade backward walk (SIM_VERSION 67)

Owner request: in Arcade, moving backwards (the held direction's x points away from the opponent's x) runs at 50% of forward speed
(`BACKWARD_WALK_PM` 500 in `src/core/data/arcade.ts`, applied to the x walk target in `arcadeMove`; vertical movement, a lone hero with no foe and Classic are
unchanged). Reason for the re-record: every Arcade golden shifted (the scripted choreographies walk away from the foe to the wall, so `tools/gen/arcade-moves.ts`
gives those legs twice the ticks), and the Classic goldens changed only in the header `simVersion`.

The scripted AI retreats and keeps playing: the Arcade 1v1 tournament has no stalemates and no timeouts. The first run without a retune moved five races
(echo 41.5%, curomo 58.5%, fiara 57.4%, morblass 54.5%), so `ARCADE_RACE_NUMBERS` life was nudged (echo 6400 -> 6750, curomo 5670 -> 5420, fiara 4295 -> 4210,
morblass 4150 -> 4080, sindarosa 2917 -> 2860). Arcade 1v1 win rates now 44.3-54.5% (1056 matches); both baselines re-recorded. Arcade 2v2 is noisy (88 matches
per race): roughly 37.5-60.2%, no stalemates or timeouts; `ARCADE_2V2_LIFE_PM` was left alone (a trial re-fit swung treenoc by 20 points on partner pairing alone).

## Arcade style-align (SIM_VERSION 69)

Roster WP 0.4, owner-approved 2026-11-14 (ideas/brainstorm/roster-24-heroes.md): the Arcade `RANGED` flag (`src/core/sim/systems/arcade/meter.ts`) follows
`HERO_STYLE` (`src/core/data/hero-style.ts`) instead of the primary ability's kind. Fiara, Morblass and Rokcore became ranged (no Charge, weather charge by
casting), Wispera melee (Charge, weather charge by walking), and the AI's spacing flips with them, so the HUD's "Ranged heroes have no charge" is now true for
every hero. Classic is unchanged. Reason for the re-record: the Arcade goldens and both Arcade baselines (Charge, weather charge and AI spacing change for
four heroes); the Classic goldens changed only in the header `simVersion`.

Arcade 1v1, `corepack pnpm balance:compare --ruleset arcade` (16 seeds per pairing, 1056 matches). With the old numbers the flag alone moved wispera to 57.4% and
ishimi to 38.6%, so `ARCADE_RACE_NUMBERS` was re-fit for those two (wispera [7950, 1355] -> [7575, 1291], ishimi [5000, 1420] -> [5400, 1535]); fiara, morblass and
rokcore kept theirs.

| | curomo | cyclonius | echo | fiara | ishimi | lavax | morblass | pax | rokcore | sindarosa | treenoc | wispera |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| win % | 51.7 | 47.7 | 49.4 | 50.0 | 49.4 | 50.6 | 50.0 | 52.3 | 51.7 | 48.3 | 48.9 | 50.0 |

No stalemates or timeouts. Style means: melee 0.505, ranged 0.497 (0.511 / 0.492 before); melee against ranged 0.507 (std err 0.021); no style findings.
A second 16-seed run from seed 41 gave 45.5-54.5%, melee 0.495 / ranged 0.503, one stalemate.

Arcade 2v2, `corepack pnpm balance:record --ruleset arcade --team-size 2` (8 seeds, 528 matches, fixed partners). The first run flagged an all-ranged team
(fiara + sindarosa) at 38.1% against the field, so `ARCADE_2V2_LIFE_PM` rose for fiara (700 -> 760), morblass (881 -> 920) and rokcore (670 -> 740). Win rates
range 40.9-63.6% (fiara 48.9, morblass 51.1, rokcore 47.7, wispera 46.6); style means melee 0.532, ranged 0.477 (0.529 / 0.479 before). The 2v2 tournament is
noisy (88 matches per race, +-5-8 points): a 16-seed run from seed 41 put the four at 46.6-52.8% but moved others by up to 10 points (lavax 40.9 -> 53.4,
treenoc 63.6 -> 58.0). Echo and treenoc (about 60%) and pax and lavax (low) were outliers before this change too; as in SIM_VERSION 67 their 2v2 life was left
alone.

## Arcade Fire Blast falloff (SIM_VERSION 71)

Fire Blast grows and fades with range in Arcade ([FUN-DESIGN 2.27](FUN-DESIGN.md)). Baselines re-recorded with `balance:record --ruleset arcade` and `--team-size 2` (reason: the falloff changes every Arcade Fire Blast hit, clash and miss).

Arcade 1v1 (1056 matches): win rates 47.2-53.4 percent (sindarosa 48.3 -> 50.0, curomo 51.7 -> 48.3, pax 52.3 -> 53.4, treenoc 48.9 -> 47.2), no stalemates or timeouts, no race moved past the 5 point tolerance. No `ARCADE_RACE_NUMBERS` re-fit was needed.

Arcade 2v2 (528 matches): sindarosa 50.0 -> 40.9 (the only race past tolerance; a close-range blast is weaker for long-range pairings), rokcore 47.7 -> 52.3, ishimi 45.5 -> 48.9, others within 3.5 points. Echo and treenoc (64-66 percent) and pax and lavax (low) were outliers before this change and are left alone.

## Arcade 2v2 round length (SIM_VERSION 78)

The nightly fun gate wants a 2v2 round median of 50-85 s; v77 measured 44.32 s. `ARCADE_2V2_LIFE_SCALE_PM` = 1300 (`src/core/sim/arcade-numbers.ts`) multiplies 2v2 hero life on top of the unchanged `ARCADE_2V2_LIFE_PM` table (two-step floor); team size 3 uses the table as is, 1v1 and Classic are untouched. Life only: supers, guard drain, damage and cooldowns are unchanged.

Legacy-12 2v2 (8 seeds, 528 matches): round median 44.32 -> 62.18 s, p90 57.96 -> 83.68 s, time-over 0.2% -> 0%, stalemate 0, first hit 1.68 -> 1.70 s, hits per minute 82.0 -> 87.2, comeback 0.811 -> 0.813, worst/best race 0.398/0.659 -> 0.386/0.591. `fun:noise --team-size 2` (4 blocks): median 61.9-63.3 s. 1v1 stays at 31.96 s (band 30-55, thin margin; a size-1 life scale of 1150 would give 37.12 s and is the ready lever, not applied). 3v3 is not gated and ran a 65 s median at v77; x1.3 would give 100.8 s with 28.7% time-overs, so it was left alone.

Largest legacy-12 2v2 race shifts: echo 62.5 -> 44.3, lavax 42.0 -> 58.0, fiara 45.5 -> 56.8, wispera 48.9 -> 38.6, sindarosa 39.8 -> 50.0, rokcore -8.0pp, treenoc 65.9 -> 59.1 (burst and trap heroes lose relative power because their damage is fixed). The Arcade 2v2 baseline was re-recorded; the 1v1 Arcade and Classic baselines are unchanged (+0.0pp).

Roster-24 full-roster 2v2 check (26 seeds, 7176 matches, win rate by hero): quarrak 55.9, nykra 53.7, umbrel 51.6, zephra 50.6, durrok 50.3, hyalia 50.1, glimmaw 49.3, abyssor 48.2, brazgor 48.1, kindrel 48.0, vortigal 44.6, ouroth 41.4. All inside 0.40-0.60; element melee-ranged gaps air -0.034, earth -0.029, fire -0.030, water +0.007 (limit 0.1). vortigal, ouroth and quarrak are outside the 0.45-0.55 soft band: a follow-up retune of `ARCADE_2V2_LIFE_PM` may nudge them. morblass now has 1.196x its 1v1 life in 2v2 (1.124x since SIM_VERSION 86), lavax and sindarosa about 1.04x.

## Arcade crowd control, flag on vs off (CB5, flag stays off)

`pnpm sim:match --tournament --ruleset arcade --ai-level 3 --seeds 16 [--cc] --json`, 176 games per race, 2026-11-15. The AI does not yet read crowd-control
statuses (no selfCc and foeCc observation fields), so this is a lower bound on how the flag plays.

| Race | Off | `--cc` | Race | Off | `--cc` |
|---|---|---|---|---|---|
| Pax | 53.4 | 40.3 | Sindarosa | 50.0 | 52.8 |
| Rokcore | 52.3 | 48.9 | Wispera | 50.0 | 48.3 |
| Lavax | 51.7 | 58.0 | Echo | 48.9 | 41.5 |
| Ishimi | 50.6 | 48.3 | Curomo | 48.3 | 41.5 |
| Fiara | 50.0 | 52.3 | Cyclonius | 47.7 | 55.1 |
| Morblass | 50.0 | 67.0 | Treenoc | 47.2 | 46.0 |

Decision: the flag stays off by default. With it on, Morblass reaches 67.0 percent (above the 65 limit) and Pax drops to 40.3, so enabling it would
need a retune and the AI observation fields first. No `SIM_VERSION` bump and no baseline was re-recorded.

## Arcade life retune (SIM_VERSION 86)

Owner request 2026-11-17 (work on balance a bit more). Data only, Arcade only (Classic hashes and baseline unchanged): `ARCADE_RACE_NUMBERS` life wispera 7575 -> 7365 and treenoc 6050 -> 6215, with `ARCADE_2V2_LIFE_PM` wispera 632 -> 650 and treenoc 714 -> 695 (their 2v2 and 3v3 life is bit-identical); `ARCADE_2V2_LIFE_PM` ishimi 720 -> 670, morblass 920 -> 865, fiara 760 -> 730, cyclonius 770 -> 810.

- 1v1 (seeds 1+41, 352 games/race): wispera was the only outlier (55.4%, z 3.51), treenoc weakest (46.6%); after: 52.0% and 50.6%, SD 3.0 -> 2.2 pp.
- 2v2 (random partners, 32 seeds, 2112 matches): ishimi 58.4% (z 4.5), morblass 56.8%, fiara 56.3%, cyclonius weak 45.3%; after the change all races are in 44.7-55.4%, SD 5.2 -> 3.2 pp. pax (55.4%) and treenoc (44.7%) are the next step.
- 3v3 (report only): SD 7.0 -> 5.9 pp; pax, sindarosa and cyclonius are still outside 45-55%.
- Fun gates pass before and after (1v1 round median 31.56 s).
- The 8-seed fixed-partner 2v2 fixture (88 games/race, SE about 5.3) moved more than 5 pp for cyclonius, morblass, pax, treenoc and wispera, so the random-partner run is the measure.
- Tour boss: AI teams beat the Void 46.2% vs 51.4% (boss-probe 12); the Void numbers are unchanged.

## Arcade stun-immunity retune (SIM_VERSION 99)

SIM_VERSION 98 (stun immunity, 20 ticks) moved wins from ranged to melee: melee vs ranged .454 -> .591, style gap about .099 (limit .06). Data-only retune of six `ARCADE_RACE_NUMBERS` rows (life, damage; `STUN_IMMUNE_TICKS` stays 20, `ARCADE_2V2_LIFE_PM` untouched): fiara 4210/1373 -> 4508/1470, pax 4600/1442 -> 4351/1364, wispera 7365/1291 -> 6833/1198, treenoc 6215/1180 -> 5998/1139, rokcore 1850/640 -> 1949/674, sindarosa 2860/724 -> 3001/760 (plan: Rank 1 option A).

Measurements (1v1, 16 seeds per block, SE about 3.8 pp per race; seeds 1-16 is the committed baseline, seeds 41-56 the second block):

| Race | v98 (1-16) | v99 (1-16) | v99 (41-56) | Mean of both |
|---|---|---|---|---|
| wispera | 64.2 | 50.6 | 44.3 | 47.5 |
| pax | 60.2 | 51.7 | 54.5 | 53.1 |
| treenoc | 56.3 | 50.0 | 44.9 | 47.5 |
| fiara | 39.8 | 43.2 | 46.0 | 44.6 |
| rokcore | 42.0 | 49.4 | 48.9 | 49.2 |
| sindarosa | 42.6 | 47.2 | 46.0 | 46.6 |

Style (seeds 1-16): melee vs ranged 59.1 -> 51.1, melee mean .558 -> .507, ranged mean .459 -> .495. Seeds 41-56: melee vs ranged 48.4, mean gap .017. Untouched races (v99 1-16 / 41-56): ishimi 54.0 / 57.4 (high, noise-level, not retuned), lavax 52.8 / 55.1, curomo 52.8 / 52.3, cyclonius 51.7 / 50.0, morblass 48.3 / 51.7, echo 48.3 / 48.9.

Open: fiara is still the weakest (about 44.6 percent over both blocks, inside noise of .45); the planned Rank 3 lever (`HIT_STUN_OVERRIDE` fireball or Fireball cooldown 26 -> 25) was not applied. A melee-favouring mechanic may still hide behind the data; the two-block means show no style gap above .06. Baselines re-recorded: Arcade 1v1 and Arcade 2v2 (the 2v2 life table is unchanged, the base numbers move); Classic is unchanged.

The scripted `arcade-moves` golden needed two edits for sindarosa's extra life (`tools/gen/arcade-moves.ts`): round 1 beat-down 12 -> 15 cones (the cones now finish p2), and the parry segment moved to the start of round 3. `trap.test.ts` uses fiara's new damage 1470.

Verification (v99, measurements, 2026-11-22; no further data change): `control-streaks.mts 4 180 6` streaks >= 180 ticks: v98 47 of 7897 (0.595%), v99 48 of 8072 (0.595%), so no worse. Arcade 2v2 (balance:compare, 8 fixed-partner seeds): style melee vs ranged 48.9% (gap .011), melee mean .493, ranged .505; report-only finding air trio gap -0.108; treenoc 71.6, pax 36.4 (2v2 life table untouched, a follow-up for `ARCADE_2V2_LIFE_PM`). `fun:gates` (seeds 8): all gates pass; 1v1 round median 31.08 s, worst/best race 0.443/0.568; 2v2 round median 59.02 s, worst/best 0.364/0.716. Not retuned: fiara 44.6 (two-block mean, within noise of .45) and ishimi 55.7; option B moves fiara the wrong way and Rank 2 applies only when lavax, morblass or cyclonius fall below .45 (none did: 55.1, 51.7, 50.0 in block 2), so no second re-record.

## Arcade 2v2 life retune (SIM_VERSION 100)

After SIM_VERSION 99 the 2v2 fixture (8 seeds, partner = race index + 6) had pax .364 and treenoc .716. Data-only change to three `ARCADE_2V2_LIFE_PM` rows (1v1 bit-identical): pax 660 -> 675, wispera 650 -> 690, echo 650 -> 680 (660, 650, 650 before SIM_VERSION 100). Cyclonius stays 810 and Rank 2 (treenoc, ishimi) is not applied (plan `.scratch/plans/2v2-life-retune.md`).

All numbers are measurements (not estimates). Random-partner = `snag-trap-teams.mts partners 2 32` (2112 matches, on-roster win %, SE about 1.9 pp); fixture = `balance:compare --ruleset arcade --team-size 2` (88 games/race, SE about 5.3 pp). R0 is v99 with no mods.

| Race | Random R0 | Random v100 | Fixture R0 | Fixture v100 |
|---|---|---|---|---|
| curomo | 58.1 | 56.1 | 44.3 | 46.6 |
| ishimi | 57.1 | 56.9 | 46.6 | 48.9 |
| fiara | 53.9 | 51.7 | 56.8 | 58.0 |
| morblass | 53.9 | 54.3 | 50.0 | 46.6 |
| rokcore | 53.4 | 51.8 | 47.7 | 48.9 |
| cyclonius | 51.0 | 47.9 | 58.0 | 59.1 |
| pax | 49.9 | 53.2 | 36.4 | 39.8 |
| lavax | 49.0 | 48.9 | 53.4 | 53.4 |
| wispera | 44.7 | 48.3 | 44.3 | 46.6 |
| sindarosa | 44.5 | 45.4 | 40.9 | 40.9 |
| echo | 44.3 | 47.7 | 50.0 | 48.9 |
| treenoc | 40.2 | 38.0 | 71.6 | 62.5 |

Why not plan option A (pax 740, cyclonius 750, wispera 690): the random-partner run showed pax 60.3 (+10.4 pp) and cyclonius 43.2 (-7.8 pp), so cyclonius stays and pax was refit to 675 (695 gave 57.1). Fixture and random partners disagree for treenoc: .716 in the fixture is a lead-order effect (treenoc+ishimi .716 led by treenoc, .466 led by ishimi); on random partners treenoc is the weakest (38.0), so Rank 2 (which would cut treenoc further) was not applied.

Style (fixture): melee mean .489, ranged .508, melee vs ranged 48.2%; air trio gap -0.113 (limit .10, report only; -0.159 with option A).

Fun gates (seeds 8, measurement): all pass; 2v2 round median 60.06 s (59.02 before), worst/best race 0.398/0.625; 1v1 round median and worst/best 0.443/0.568 unchanged.

Open, not met: on random partners curomo 56.1, ishimi 56.9 and treenoc 38.0 are still outside .45-.55 (morblass 54.3 is inside). In the fixture pax 39.8 is just under .40 (noise-level, SE 5.3) and treenoc 62.5 is a lead-order exception. Fixing treenoc, ishimi and curomo is Rank 2 or a separate retune; making the fixture play both lead orders is Rank 3 (not built).

## Arcade 2v2 life retune (SIM_VERSION 101)

After SIM_VERSION 100 random partners had treenoc 38.0 and curomo/ishimi/morblass 54-57. Data-only change to six `ARCADE_2V2_LIFE_PM` rows (1v1 bit-identical, size < 2 returns hpPm): treenoc 695 -> 785, ishimi 670 -> 630, curomo 740 -> 700, echo 680 -> 710, wispera 690 -> 710, sindarosa 800 -> 830. One round (set E) was enough; no half-step or 1.5x-step correction (plan `.scratch/plans/2v2-life-retune-2.md`). R0 (v100) is the previous section's measured table.

Measured (not estimates): random partners = `snag-trap-teams.mts partners 2 32` (2112 matches, on-roster win %, SE about 1.9 pp, 0 stalemates, p50 151 s); fixture = `balance:compare --ruleset arcade --team-size 2` (88 games/race, SE about 5.3 pp). Estimates (e) are from the plan.

| Race | Random v100 | Random v101 | est (e) | Fixture v100 | Fixture v101 |
|---|---|---|---|---|---|
| pax | 53.2 | 53.0 | 52.2 | 39.8 | 44.3 |
| rokcore | 51.8 | 52.0 | 50.8 | 48.9 | 51.1 |
| morblass | 54.3 | 51.8 | 53.3 | 46.6 | 43.2 |
| wispera | 48.3 | 51.8 | 50.2 | 46.6 | 42.0 |
| treenoc | 38.0 | 51.0 | 49.8 | 62.5 | 64.8 |
| fiara | 51.7 | 50.1 | 50.7 | 58.0 | 50.0 |
| ishimi | 56.9 | 50.1 | 50.1 | 48.9 | 46.6 |
| cyclonius | 47.9 | 49.4 | 46.9 | 59.1 | 54.5 |
| curomo | 56.1 | 49.2 | 49.8 | 46.6 | 43.2 |
| echo | 47.7 | 48.7 | 50.1 | 48.9 | 56.8 |
| lavax | 48.9 | 47.4 | 47.9 | 53.4 | 55.7 |
| sindarosa | 45.4 | 45.4 | 48.1 | 40.9 | 47.7 |

Zero-sum check (-d/11): the six unchanged races (pax, rokcore, morblass, fiara, lavax, cyclonius) moved -0.4 pp on average against -0.95 predicted, inside the 1.4 pp run noise. Random-partner spread 45.4..53.0 (was 38.0..56.9); every race is in .45-.55 (acceptance met), sindarosa is at the edge (45.4, did not move despite +3.75% life; the 1.5x step 845 was not tried). Random-partner element trio means: fire 47.6, water 50.4, air 50.0, earth 52.0, so the largest gap is 4.4 pp (limit 10). Fixture: air trio gap -5.1 pp (mean(echo, wispera) 49.4 minus cyclonius 54.5; limit 10); fixture treenoc 64.8 is the documented lead-order exception (treenoc-led treenoc+ishimi), every other fixture race is .42-.57. Style (fixture): melee mean .502, ranged .498, melee vs ranged 50.4%.

Fun gates (seeds 8, team size 2, measurement): all pass; round median 61.76 s, worst/best race 0.42/0.648. `fun:gates --team-sizes 3` has no bands (the run aborts), so 3v3 stays report only; boss-probe output was recorded at `.scratch/boss-E.txt` (not committed, no v100 reference rerun).

Re-record: arcade and classic goldens (Classic changes only the simVersion header) and `arcade-2v2-baseline.json`.

## Arcade 2v2 hidden-hero life retune (SIM_VERSION 102)

After SIM_VERSION 101 the full-roster 2v2 tournament (`run-match.ts --tournament --roster full --ruleset arcade --team-size 2 --ai-level 3 --seeds 16`, 4416 matches, plan `~/claudetmp/plans/small/2v2-life-retune-v101.md`) showed every team as one fixed legacy + hidden pair (legacy hero at index i, hidden hero at i + 12), with pair means .364-.677. Released races are held (their random-partner rates are in band at v101). Data-only change to eight hidden-hero `ARCADE_2V2_LIFE_PM` rows (1v1 untouched): kindrel 725 -> 755, nykra 740 -> 655, quarrak 725 -> 675, brazgor 460 -> 490, durrok 590 -> 625, zephra 760 -> 830, abyssor 430 -> 475, vortigal 740 -> 650. Held: hyalia, glimmaw, ouroth, umbrel.

Method (measurements, `TTE_MODS` life mods, one sim process, no repo edit until accepted; SE about 2.6 pp per team, 1.8 pp per pair mean). Round 1 used the plan's set A (zephra 865, vortigal 610, nykra 630): zephra pair .571, treenoc/vortigal .420 and nykra pair .461 were more than 3 pp off (slopes measured 1.5, 1.46 and 1.24 pp per 1% of life, higher than the plan's 1.0). Round 2 refit those three (zephra 830, vortigal 650, nykra 655); cap of 2 rounds reached.

Pair table (win rate, legacy-led / hidden-led, mean). before = v101, after = round 2 (committed values):

| pair | before legacy / hidden | before mean | after legacy / hidden | after mean |
|---|---|---|---|---|
| curomo / kindrel | .432 / .481 | .457 | .546 / .535 | .540 |
| cyclonius / nykra | .625 / .666 | .645 | .516 / .459 | .488 |
| echo / quarrak | .563 / .571 | .567 | .505 / .476 | .490 |
| fiara / hyalia | .552 / .463 | .508 | .541 / .471 | .506 |
| ishimi / brazgor | .440 / .432 | .436 | .476 / .489 | .482 |
| lavax / glimmaw | .505 / .507 | .506 | .489 / .501 | .495 |
| morblass / durrok | .432 / .446 | .439 | .462 / .495 | .479 |
| pax / zephra | .326 / .402 | .364 | .459 / .524 | .492 |
| rokcore / ouroth | .446 / .516 | .481 | .467 / .478 | .473 |
| sindarosa / abyssor | .375 / .408 | .391 | .470 / .530 | .500 |
| treenoc / vortigal | .726 / .628 | .677 | .514 / .500 | .507 |
| wispera / umbrel | .541 / .519 | .530 | .584 / .511 | .547 |

Spread .326-.726 -> .448-.584. 22 of 24 teams are inside .45-.55; the exceptions are wispera .584 and curomo .546/kindrel .535 pair mean .540 (within noise of the +-3 pp acceptance, not refit: the 2-round cap). Wispera is a released race, held; its rise is the field effect of fixing the low pairs. Random-partner (`snag-trap-teams.mts partners --roster full`) was not run for this change; the harness now accepts `--roster full` for the next retune.

Re-record: arcade and classic goldens (only `arcade-roster24-b1/-b2/-b3` change hash; every other golden changes only the simVersion header). `balance:compare --ruleset arcade --team-size 2` (legacy 12) is unchanged; no `balance:record`.
