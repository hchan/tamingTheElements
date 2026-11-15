---
status: idea
added: 2026-11-14
---

# Element gems and random power-ups

Owner idea (2026-11-14). Each element stage holds 3 gems, scattered at random on the map. There is one gem type per element: fire gem, water gem, earth gem, air gem.

## Rule

- A fighter whose element matches the stage's environment can collect that stage's gems (a fire hero on the fire stage takes fire gems).
- Each gem collected grants a RANDOM power-up from that element's list of three. A hero should not get the same power-up twice in a match.
- The same applies to every element, each with its own list.

## Example list (fire)

1. Auto-seeking missile: the fire projectile homes in on the foe.
2. Missile twice as large and twice as powerful.
3. The hero grows to 200% size and strength.

Water, earth, air and void lists are still to design. They should stay in character: ice shards that split, a boulder that rolls through, a gust that pulls, and so on.

## Open design questions

- Do the gems respawn, or are the 3 gems a one-off per match? Does a power-up last a fixed time or the rest of the round?
- What if a hero of another element stands on a gem: ignore it, or deny it by touching?
- Strength and size at 200% needs a cap and a counter (a bigger hitbox is easier to hit). Probably a timed buff with a clear visual.
- Placement: seeded sfc32 in the sim, chosen away from spawn points, and equal for both sides so it stays fair.
- Readability: gem glow, pickup cue, a HUD icon for the active power-up, and a screen-reader line. Reduced-motion steady.

## Implementation notes

Sim change (Arcade only, SIM_VERSION bump, goldens and baselines re-recorded with a stated reason), so it queues behind other sim work: one sim-changing agent at a time. Pairs with [stage-selection-hazards](stage-selection-hazards.md) and the per-element stage arenas. Presentation lives in `src/game/fx/` (a new gem view).
