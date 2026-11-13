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

## Second slice (SIM_VERSION 45, 2026-11-13)

- Sizes up to 4x were already supported by the linear curves (3x: life x1.9, damage x1.24, weight x2.2, speed x0.44, 240 box); pinned in `size.test.ts`. No hero is 3x yet.
- Ishimi is 150 (1.5x mid-size bruiser; Pax was tried first but nearly every test uses Pax at 1x): 120 box, life x1.225, damage x1.06, knockback / 1.3, speed x0.86. Race numbers 6400 / 1550 -> 4800 / 1420 (5400 / 1480 gave 62.5%).
- Snag root on a bigger target is shorter (`sizeRootPm`: -250 pm per extra 1x, floor 400 pm): 2x 45 ticks, 3x 30, 4x 24. Giants are slow, so a full root would be a free kill.
- Pan camera: the zoom floor already shows the whole 1920 world; the framing margin now grows with the larger fighter's half-width above 40 (`CameraInput.reach`), so a 4x body (half 160) stays inside the view. Spawns (480 / 1400 centres) leave room: a 4x box is 320 wide and starts centred on the 1x centre.
- Deferred: bigger baked art (sprites currently scale the baked frame with the box), 3v3 team-size budget, turn rate and swap-in time.
