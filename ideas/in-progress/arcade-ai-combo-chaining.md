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
