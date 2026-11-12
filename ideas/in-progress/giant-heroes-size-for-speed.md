---
status: in-progress
added: 2026-11-12
---

# Giant heroes: size trades speed for strength

Owner idea (2026-11-12): play with hero SIZE. Some heroes 2 to 4 times as large as the rest; size brings strength at the cost of speed.

## Sketch

- A per-character `scale` (1x to 4x) in the character data: hitbox and hurtbox grow with it; the baked sprite is drawn at that scale.
- Trade-off curve: damage, health and knockback weight rise with size; walk and dash speed, turn rate and swap-in time fall. Small heroes stay fast and fragile.
- Counter-play: a big hero is an easy target for ranged and trap play, slow to dodge Weather, and cannot dash through gaps; the pan camera and arena width must fit a 4x hero (check the zoom floor and spawn spacing).
- Knockback and Snag (rope root) scale with the target's size; tiny heroes can be knocked far, giants barely move.
- Sim-changing (hitboxes, speeds): needs a SIM_VERSION bump, golden and balance re-record with a stated reason, and one sim-changing agent at a time. Integer or LUT scale only (determinism).
- Art: bake the big sprites at higher resolution so they stay sharp (Fiara's rigged and baked look).
- Candidate giants: Rokcore (earth) first; check 3v3 team-size budget (a giant costs more of a team?).


## First slice (SIM_VERSION 41, 2026-11-12)

- `src/core/data/size.ts`: per-character integer size (100 = 1x, max 400); Rokcore is 200. Arcade only (Classic ignores it).
- At 2x: 160x160 box (centred where a 1x hero stands), life x1.45, damage x1.12, knockback / 1.6, walk and dash speed x0.72 (integer per-mille curves, linear in size - 100).
- Rokcore's Arcade race numbers were lowered (hpPm 2600 -> 2100, dmgPm 690 -> 650) so the giant bonus does not stack on the strongest kit.
- Swap-in places a different-sized partner on the outgoing hero's centre, clamped to the arena. Renderer reads the box (`c.w/c.h`), so sprites scale with it.
- Deferred: Snag (rope root) scaling with target size, the 3v3 team-size budget, sizes above 2x, bigger baked art, turn rate and swap-in time.
