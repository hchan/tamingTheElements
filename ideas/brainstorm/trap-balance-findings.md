---
status: idea
added: 2026-11-12
---

# Trap balance findings (evidence for WP 39d / 39e)

Evidence only: no sim rule was changed. Source: `ideas/done/wp39-bomb-trap.md` (design and starting numbers), 39c AI (places traps through the Arcade tactics). Branch state: main at fb2d352, SIM_VERSION as in the tree.

## Method

- A throwaway harness (not committed; it wraps the exported `makeTeamAgent`, `createMatch`, `step` of `tools/sim/run-match.ts` in a 1v1 Arcade loop) counted `trapPlaced`, `trapTriggered` (by reason) and `hitConfirmed` with `ability === TRAP_BOMB_DEF / TRAP_SPIKE_DEF`, per race, over the full round robin: 66 pairings x 8 seeds = 528 matches (sides swapped on odd seeds), level 1, `--ai-level 3` (Normal) and `4` (Hard), seed base 1, same match seeds as `pnpm sim:match --tournament`.
- Ablation: the same 528 matches with bit 6 (Trap) masked out of every agent command. The AI's RNG and memory still run, so the only difference is that no trap exists. This isolates the effect of traps on win rate without touching sim code.
- Each race has 88 games per run, so one race's win rate has a 95% interval of about +-10 points. Read single-race deltas as noise unless they repeat across Normal and Hard.

## Results

### Usage: traps are not ignored

| | Normal | Hard |
| --- | --- | --- |
| traps placed per match (both sides) | 5.2 | 11.5 |
| matches in which a given race placed at least one | 74 to 95% | 97 to 100% |
| placements per hero per minute | about 1.4 (cap by cooldown: 6) | much higher |

The AI is using the button, but at Normal only about a quarter of what the 500-tick cooldown allows.

Outcome of the traps that ended (Normal, 2530 of 2750 placed; the rest were cleared by the round ending):

- 53% timed out (1469), 34% fired on overlap (924), 5% were doused by fire (137).
- Fire Bomb hit a foe on 48% of placements (Fiara), 51% (Lavax), 35% (Sindarosa); Spike 40 to 42%. More than half of all traps die at their timeout, and a timed-out Puddle or Gust shows no effect at all.

### Damage share and kills: traps are a garnish

| Race (kind) | placed/match | trap damage share | trap hits that KO |
| --- | --- | --- | --- |
| fiara (bomb) | 4.05 | 6.4% | 12 |
| pax (spike) | 3.47 | 3.8% | 5 |
| lavax (bomb) | 2.56 | 2.7% | 5 |
| treenoc (spike) | 2.59 | 2.1% | 2 |
| rokcore (spike) | 3.13 | 1.4% | 0 |
| sindarosa (bomb) | 2.89 | 1.3% | 2 |
| curomo, ishimi, morblass (puddle), cyclonius, echo, wispera (gust) | 1.5 to 2.6 | 0 (by design) | 0 |

- All traps together deal 1.43% of all damage at Normal (17,077 of 1,190,609) and 2.59% at Hard. 26 trap hits ended a round in 528 matches (about 1.6 rounds in 100).
- Mean damage per trap hit differs a lot for the same base number: Fiara 35.5, Pax 29.7, Treenoc 24.1, Lavax 20.4, Sindarosa 14.1, Rokcore 13.0 (base 22 for bombs and 18 for spikes). The spread must come from the caster's damage stat, level scaling and combo scaling; not verified here. Fiara's bomb out-damages Sindarosa's by 2.5x for the same rule.

### Race win rates and the ablation (Normal, 88 games each)

| race | with traps | traps off | delta |
| --- | --- | --- | --- |
| pax | 56.8 | 55.7 | +1.1 |
| treenoc | 56.8 | 54.5 | +2.3 |
| wispera | 54.5 | 51.1 | +3.4 |
| fiara | 52.3 | 46.6 | +5.7 |
| ishimi | 51.1 | 55.7 | -4.5 |
| morblass | 51.1 | 48.9 | +2.3 |
| echo | 50.0 | 48.9 | +1.1 |
| curomo | 45.5 | 45.5 | 0.0 |
| sindarosa | 44.3 | 48.9 | -4.5 |
| rokcore | 43.2 | 39.8 | +3.4 |
| cyclonius | 47.7 | 47.7 | 0.0 |
| lavax | 36.4 | 42.0 | -5.7 |

- Range with traps 36.4 to 56.8, without 39.8 to 55.7: traps barely move the spread. Mean absolute change 2.8 points (Normal) and 5.6 (Hard), both inside the noise of 88 games.
- Outside the 45 to 57% band with traps on: lavax 36.4, rokcore 43.2, sindarosa 44.3. Lavax and Rokcore were already low without traps (42.0 and 39.8), so that is an AI/race issue, not a trap one (see `ideas/brainstorm/arcade-stalemate-lavax-ishimi.md`).
- Hard (`--ai-level 4`): race range 11% to 82% with traps and 14% to 84% without. That spread is the Hard AI, not traps; do not tune traps against it.
- Dominance: no race is dominated by traps. Fiara gains the most (+5.7 Normal, +4.5 Hard), Lavax and Sindarosa lose (a placed bomb is a pure damage trade at base 22 and their hits do the least). Direction is consistent for Fiara (+, +) and Sindarosa (-, -), the only two that repeat across both levels.
- Water and air traps (Puddle, Gust) leave win rate unchanged (curomo and cyclonius have a delta of exactly 0.0 at Normal): the slow and shove are not converting into damage for the AI.
- `pnpm balance:compare` (committed baseline; not trap-specific): all deltas +0.0pp, no stalemate or timeout change.

### Not measured

- "Snag then trap" lockdown (the design's biggest risk): needs a scripted input stream, not the AI. The 39c AI does a hard-AI version only; no data here.
- Puddle slow time per match and Gust wall-bounce count: no event exists for them (`trapTriggered` fires for a Puddle only at its end).
- Human play, 2v2/3v3, corner camping.

## Tool gaps found (tooling only, no sim change)

1. `tools/sim/run-match.ts` names a trap hit `unknown` in `damageByAbility` (`TRAP_BOMB_DEF` and `TRAP_SPIKE_DEF` sit past `ABILITY_DEFS`, as `SUPER_DEF` and `CHARGE_DEF` are special-cased). Add `trap-bomb` and `trap-spike` sources next to `SUPER_SOURCE`.
2. `fun-metrics` counts traps per pairing only; add per-race placed / overlap / timeout / doused and trap damage so a tournament reports the table above directly.
3. Add an optional `--no-traps` flag (mask bit 6 in the agent, as in this ablation) so `balance:compare` can report the trap effect without hand harnesses.

## Proposed tuning (batch into one SIM_VERSION bump and one golden re-record, 39d)

Priority order; each is one constant in `src/core/data/arcade.ts`.

1. **Per-hit damage evenness.** Keep `TRAP_FIRE_DAMAGE` 22 and `TRAP_SPIKE_DAMAGE` 18 as the base, but confirm why Sindarosa and Rokcore deal 13 to 14 per hit against Fiara's 35: if it is the caster's damage stat, raise Sindarosa's and Rokcore's trap hits via a per-hit floor (`max(base, 20)` before scaling) rather than the base constant, so all damage traps are worth a 10 s cooldown.
2. **Water and air need a reward.** They do no damage and the AI does not turn the slow or shove into a hit. Proposed: `TRAP_PUDDLE_SLOW_PM` 600 -> 500 (50% speed), `TRAP_PUDDLE_LINGER_TICKS` 40 -> 60, and `TRAP_GUST_KB_Q4` 224 -> 288 (one wall bounce from mid-arena). Re-measure with the ablation: success is the Puddle and Gust races moving 3 to 5 points, not zero.
3. **Timeouts do the work, so shorten them.** 53% of traps time out. Proposed: `TRAP_LIFE_TICKS` bomb 150 -> 120, spike 200 -> 160, gust 200 -> 150, puddle 300 -> 250; more fuse tension and fewer free blasts. Bomb timeout at 60% damage if timeouts start to decide rounds (they do not now: 26 KOs in 528 matches).
4. **Cooldown and cap stay.** The AI uses a quarter of the cooldown budget at Normal, so `TRAP_COOLDOWN_TICKS` 500 and `TRAP_TEAM_MAX` 2 are not the limit. Do not lower the cooldown until the AI places more at Normal.
5. **Do not buff trap damage.** Trap damage is 1.4% (Normal) to 2.6% (Hard) of all damage and no race is dominated; raising `TRAP_FIRE_DAMAGE` above 22 risks the "no-skill damage" risk in the design for little gain. If a buff is wanted for feel, raise the Hard AI's placement rate instead (39c), not the numbers.
6. **Fire counter (douse) stays.** 5% of triggers; it is the single counter-play rule; only Puddles and Gusts can be doused, so it hits the water and air casters.

Acceptance for the follow-up WP: race win rates within 45 to 57 (or no worse than the ablation baseline for races already outside it), trap damage share 2 to 5% at Normal, timeout-share of fired traps under 45%, 0 change in `classic-hash-pins`, new Arcade golden that casts each kind.

## View polish shipped with this note (no sim change)

`src/game/audio/arcade-cues.ts`: `trapTriggered` with reason doused plays a short hiss (`trapDouse`) instead of the blast pop, and a Puddle drying up at its timeout is silent (it used to pop like a bomb). Test in `arcade-cues.test.ts`.

## Harness

Measurement scripts are kept in `tools/sim/trap-ablation/` (`trapstats.mts`, `report.mjs`); they were written in a scratch dir and copied here as-is, unpolished (not wired into lint-clean tooling; see the `--no-traps` flag idea above).
