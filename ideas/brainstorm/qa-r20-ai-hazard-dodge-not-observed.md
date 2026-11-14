---
status: idea
added: 2026-11-14
---

# QA r20: AI hazard dodging not observed in real-time play

Real-time play (no manual=1), seed 7, Pax as AI, hero vs Pax on each stage, weather super fired once per stage. At the strike frame the foe centre was inside the hazard on water (full-width tide), earth (176x176 slab) and air (full-width gale band); outside only on fire (narrow strip at x=1552, which the foe was never near, so not a dodge either). One run per stage, so this is not proof SIM_VERSION 55 dodging is broken. Water and air bands span almost the whole arena, so there may be no safe spot reachable in time; confirm the AI path to safety and give those hazards a safe lane or longer warn. Note: manual step() leaves the AI idle, so dodging can only be judged in real time or via a sim test. Idea: add a sim-level test or tools script that logs the foe inside-at-strike rate over many seeds.

## Progress (2026-11-14, probe: tools/sim/hazard-dodge-probe.ts)

`tsx tools/sim/hazard-dodge-probe.ts --seeds 96`: AI vs AI, stage forced per match, 96 seeds (race pairs rotate) x 4 stages x Normal (level 3) / Hard (level 4), SIM_VERSION 55. "Dodge off" replaces `ArcadeTactics.hazard` by a no-op (prototype patch in the script, no src change). Inside = fighter box overlaps the strike box on the strike tick (2 fighters per strike); hits = `hazardHit` events (damage; invulnerable fighters and the never-last-HP rule excluded).

| stage | level | strikes | inside, dodge on | inside, dodge off | hits on / off |
|---|---|---|---|---|---|
| fire (96x20 lane) | Normal | 419 / 403 | 3.8% | 9.6% | 32 / 76 |
| fire | Hard | 290 / 305 | 2.4% | 11.3% | 13 / 67 |
| earth (176 rock) | Normal | 493 / 489 | 41.2% | 75.2% | 397 / 716 |
| earth | Hard | 334 / 340 | 31.7% | 64.6% | 205 / 425 |
| air (120 band) | Normal | 256 / 255 | 22.3% | 51.6% | no damage |
| air | Hard | 275 / 271 | 20.9% | 50.6% | no damage |
| water (whole field) | both | ~250 | 100% | 100% | no damage |

Findings:
- The dodge works: it roughly halves inside-at-strike and earth damage on every damaging or displacing stage, a bit better on Hard. The QA r20 single-run observation was not a dodge bug.
- Earth is the weak spot: the rock is centred on a fighter at warn time and is 176 px, so escape needs ~130 px (80 px fighter) in 50 ticks, minus the 10 (Normal) / 4 (Hard) tick reaction. Still 32-41% of fighters are inside at the strike (the rule skips a fighter that is stunned, dashing, guarding, charging, in a super or rooted, and the foe in melee range is often under the rock too). Candidate: longer earth warn, or a rock that centres on the foe's predicted spot.
- Water: the tide covers the whole field, so no safe spot exists by design; it never damages, it only drifts ~130 px over 100 ticks (cap 150 px over HAZARD_ACTIVE_TICKS 150), clamped at the arena edge. Nothing to dodge, so 100% "inside" is expected and harmless; if a lane is wanted it is a design change (e.g. a dry strip).
- Air: a safe spot always exists. Playfield y 200..640 (440 tall), band 120, fighter 80: a fighter is clear above when band top >= 280 and below when band top <= 440, so at least one side always works, and the worst case is ~140 px vertical at speed 6-7 px/tick (about 20 ticks, inside the 50 tick warn). The gale only pushes (no damage); the residual ~21% inside is fighters the rule skips (stunned, dash, guard, etc.).
- Fire: lava lane is narrow and fighters are rarely in it even without dodging (10%).
