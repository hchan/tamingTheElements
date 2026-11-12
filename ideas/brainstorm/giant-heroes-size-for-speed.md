---
status: idea
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

