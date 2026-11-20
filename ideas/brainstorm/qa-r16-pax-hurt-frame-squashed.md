---
status: idea
added: 2026-11-14
---

# Pax hurt/stun frame renders as a flat jagged orange smear

On the water stage (Sindarosa vs Pax, seed 7) the frame right after a hit shows Pax squashed into a wide, flat, hard-edged orange silhouette with rectangular cut edges and no fur or rock detail, next to the damage number. It lasts across several 120 ms screenshots, so it is not a single-tick flash. It looks like the r15 "air sprite tear" (qa-r15-air-sprite-tear), now with a clear repro: a stretched hurt or knockback frame with a clipped quad on a bright backdrop. Check the Pax hurt cell and the hit-flash tint and stretch code.

Shots: ~/claudetmp/qa-r16/11-water-hit1.png (also 11-air-hit0.png and 11-earth-hit0.png, where Pax and Rokcore go flat white for several frames, losing the hi-res detail).
