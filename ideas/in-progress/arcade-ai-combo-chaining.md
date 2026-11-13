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
