---
status: idea
added: 2026-11-12
---
# Why Cyclonius, Lavax and Rokcore are low in Arcade (analysis, SIM_VERSION 35)

Harness: `tools/sim/low-races/lowraces.mts` (`tsx tools/sim/low-races/lowraces.mts 24 3 ~/claudetmp/out.json`), 24 seeds, Normal, round robin.
Not run: `balance:compare`. Per-slot damage labels are approximate (verified for Lavax only); win rates, first-hit times, ability counts and the matrix are solid.

| Race | Win % | Notes |
|---|---|---|
| lavax | 41.3 | first own hit 4.4 s (fast races 1.7 s); deals 942, takes 661 yet loses 59%; 4 stalemate draws; 72% of damage from crimson-fire |
| cyclonius | 42.0 | first hit 3.8 s; deals 1061, takes 986; matchups 0 vs lavax and fiara, 100 vs treenoc |
| rokcore | 45.5 | deals 1110, takes 571 (best ratio) but lands the first hit only 33%; dashes 11.3x per match (others 4-8) |
| pax, treenoc | 56.3 | high end |

- Traps are not the cause (2 to 3% of their damage). No timeouts anywhere. Supers are fired 4.5-4.8x a match and AI uses each kit.
- The matchup matrix is almost all 0 or 100: pairings are decided by element/weather counters or AI personality, so small stat changes move little.
- Not read yet: `scripted-ai/arcade.ts` and `arcade-ai.ts` (is Rokcore's dashing and slow opening in the tactics layer?).

## Proposals (unapplied, untested, ranked)
1. First find what decides the 0/100 matchups (`sim:match --a lavax --b curomo --seeds 20`): element and weather counters vs AI personality.
2. Rokcore: AI attacks before dashing (est. +3 pp).
3. Lavax: `hpPm` 3500 to about 4000 (est. +3 pp; may cut stalemates).
4. Cyclonius: shorter time to first hit (tornado cooldown or first wind-cone), weakest-supported (est. +3 pp).
Any change bumps SIM_VERSION and re-records Arcade baselines with a stated reason.

## Findings (investigation WP, no sim or AI change; SIM_VERSION stays 35)

Harness: scratch scripts (12 seeds per pairing, Normal, sides alternate), variants set at runtime: `void` (both elements neutral), `flat` (all hpPm/damagePm = 4000/1000), forced personality, level.

**What decides the 0/100 matchups**
- The AI is deterministic and kit strength dominates: even with elements void and stats flat, 53 of 66 pairings are extreme (below 10% or above 90%). The per-race hp/damage fit cancels kit strength on average only; each pairing stays step-like.
- The element chart (1.25 each way = 1.5625x damage ratio, plus x1.2 weather) pushes more pairings to the ends: 42 of 66 extreme with elements vs 24 of 66 with void.
- Forced personality (Rushdown, Zoner, Turtle) and side swap do not move the 0% results: personality is not the cause.
- Lavax vs Morblass is 0% in every variant, including void + flat: Morblass icicles land 58 hits (599 dmg) a match, 31.5 projectile clashes a match, Lavax deals about 405 vs 932. Kit/clash issue, not stats or element.
- Cyclonius vs Lavax stays 0% under void + flat (kit). Rokcore vs Echo: flat stats give 100%, so the fitted stats (2470/690) combined with the element chart make it 0% (stat fit and element interplay).

**Tactics layer (arcade.ts, arcade-ai.ts)**
- Rokcore (12 seeds, all opponents): 11.0 dashes a match, but the tactics layer adds only about 1.0 (dodge 0.8, trap-avoid 0.1, rush 0.1). The rest come from the base ScriptedAI/kit, not from ArcadeTactics. First hit own 85 of 286 rounds (30%), after 3.2 s vs foe 2.0 s.
- Lavax: first cast 0.28 s, first own hit 4.4 s; Cyclonius first cast 0.29 s, first hit 4.1 s. They fire immediately, so the slow first hit is projectile travel, spacing and the foe dodge/guard plans, not hesitation in tactics (tactics dashes 1-3 a match).
- Result: no small, clearly-correct tactics fix found; nothing implemented. Remaining levers are balance (stats/kit), proposals 2 to 4 above, and the Lavax-vs-Morblass clash handling.
