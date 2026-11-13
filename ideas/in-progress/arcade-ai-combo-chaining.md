---
status: in-progress
added: 2026-11-12
---

# Arcade AI combo chaining (fun-gate: median combo hits 1, target 2)

SIM_VERSION 43, Arcade AI only (`src/core/agents/scripted-ai/arcade.ts`). During a hit stun Normal and Hard heroes now: use Charge as a follow-up from range (a charge hit counts as a combo hit); step onto the stunned foe's line when a non-Snag slot is ready (ranged, `alignStep`); close in when a slot is ready (melee).

Results (1v1, all pairings, 8 seeds, aiLevel 3): round median 45.7 -> 45.2 s, stalemate 0 -> 0, time-over 0 -> 0.001, worst race 0.42 -> 0.43, best race 0.614 -> 0.614, combo median 1 -> 1 (p90 4 -> 4), 2v2 combo median 2. Probe: share of combos with 2+ hits 0.455 -> 0.471. Classic `balance:compare` unchanged (all 0.0pp).

Not reached: the 1v1 median stays 1. Diagnosis: during the stun after a first hit a ready slot existed in only about 18% of ticks (ranged heroes: no slot ready and no Charge in about 100k of 290k stun ticks), so cooldowns, not alignment, limit chains.

Leftover ideas:
- Hold back the second ability: do not fire both slots at once when in range; keep one for the follow-up inside the 32-48 tick stun.
- Open with an ability whose cooldown is shorter than the stun.
- Ranged heroes: a Charge follow-up needs a Charge (`chargeIn === -1` means none); consider a short dash.
- Raise the Normal combo cap (`combo > level * 2`) only if hits end combos early (p90 is 4, so probably not).

## Hold-back experiments (2026-11-12, not shipped, SIM_VERSION stays 44)

Probe: 15 races x all pairings, 6 seeds, aiLevel 3 (share of combos with 2+ hits; `fun:noise` 4 blocks x 8 seeds for the rest). Baseline: share 2+ 0.470, combo median 1, round median 48.2 s, worst race 0.414, best 0.642.
- Fire only the primary when both slots are pressed at an upright foe: share 0.465 (no effect; the base AI almost never presses both slots in one tick).
- Do not fire a slot while the other non-Snag slot is within N ticks of coming off cooldown (so both are ready for open + follow-up):
  - N 75: share 0.478.
  - N 250: share 0.487, fewer combos overall (22.7k vs 25.7k).
  - N 300 (fun:noise): median still 1, round median 52.6 s, worst race 0.053, best 0.761: balance broken (races with long cooldowns stop firing).
  - N 600 (fun:noise): median 1.5 (blocks 1..2), but round median 56.0 s (out of band), worst race 0.129, best 0.841, time-over 0.055.
- Conclusion: a global hold-back trades combo length for fire rate and wrecks balance; reaching median 2 needs per-race data (open with the short-cooldown slot, keep the long one) or a gameplay change (shorter stun-window cooldowns, a combo-starter), not an AI wait rule. Idea stays open.

## Per-ability follow-up experiments (2026-11-12, not shipped, SIM_VERSION stays 44)

Probe: 15 races x all pairings, 4-6 seeds, aiLevel 3, Arcade. Baseline (6 seeds): 25.7k combos, median 1, p90 5, share 2+ 0.470, round median 48.5 s, worst race sindarosa 0.379, best pax 0.652.
- Diagnosis of the stun window (temporary counters, not committed): a ready slot exists in only a few percent of stun ticks for melee-opener races (Wispera sonar-blast, cooldown 30, ready about 4% of stun ticks; attack presses under 1%). No Arcade cooldown scaling exists (grep of `src/core/data/arcade.ts`), so the base AI has simply spent both slots before the hit lands: it fires the secondary whenever it is ready and in reach, and the primary whenever lined up. The follow-up logic in the stun branch (`alignStep`, `toward`) is therefore not the bottleneck.
- Per-slot "primary first" hold (Normal and Hard: drop the secondary press while the foe is upright, no primary press is on and slot 0 is ready and not Snag, so the secondary is still ready when the stun starts): share 2+ 0.466 (4 seeds), no gain, worst race fell to fiara 0.227. The secondary, not an early primary, is what the base AI fires first, but holding it just delays fire and does not leave a follow-up ready after the first hit lands.
- From the earlier hold-back table, a wait that is short enough to keep balance (N 75) gains under 1pp of share 2+; the larger ones that move the median (N 600) break balance. So a pure AI rule cannot reach median 2 here: the available levers are data or gameplay (follow-up slot cooldowns under the stun length for the melee-opener races, a combo-starter, hit stun scaling with combo position), which are design changes and were not made.
- Result: no code change shipped; combo median stays 1 (share 2+ 0.47), win-rate spread unchanged (worst 0.379, best 0.652 in the probe). Open.
