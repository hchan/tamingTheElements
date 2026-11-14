---
status: done
added: 2026-11-14
---

Outcome: not the rig, bake or scale (sheet cells, UVs and a paused render are clean). Phaser 4.2's camera shake translates the camera matrix after the view is built, and any sprite drawn while that offset is live came out clipped to jagged rectangles and wedges (in-engine snapshot shows it; with the offset off the frames are clean). Fix: `src/game/fx/camera-shake.ts` disables the effect's matrix hook and applies the same offset, rounded to whole pixels, as a camera scroll for the render only (timing, `isRunning` and the decay stay as before). Unit test `camera-shake.test.ts`; verified with before/after headless real-game shots.


# Pax hurt/stun frame renders as a flat jagged orange smear

On the water stage (Sindarosa vs Pax, seed 7) the frame right after a hit shows Pax squashed into a wide, flat, hard-edged orange silhouette with rectangular cut edges and no fur or rock detail, next to the damage number. It lasts across several 120 ms screenshots, so it is not a single-tick flash. It looks like the r15 "air sprite tear" (qa-r15-air-sprite-tear), now with a clear repro: a stretched hurt or knockback frame with a clipped quad on a bright backdrop. Check the Pax hurt cell and the hit-flash tint and stretch code.

Shots: ~/claudetmp/qa-r16/11-water-hit1.png (also 11-air-hit0.png and 11-earth-hit0.png, where Pax and Rokcore go flat white for several frames, losing the hi-res detail).
