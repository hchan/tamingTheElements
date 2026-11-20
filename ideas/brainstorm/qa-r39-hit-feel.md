---
status: idea
added: 2026-11-14
---

# QA r39 hit feel (heavier plain hits, WP merged as 0f810ec2)

Frames: ~/claudetmp/qa39/hit/fiara-hit-t00..t16.png (fiara vs treenoc, lava), pax-hit-t02.png (pax vs lavax, sand), curomo-hit-*.png, stage shots ~/claudetmp/qa39/s/stage-*-hit.png, tour ~/claudetmp/qa39/s/tour-fight-hit.png.

Better than r38:
- Contact core plus orange streak fan is now unmistakable at t00-t08; it lingers (still on screen at t08), which sells hit-stop.
- Foe turns a pale ghost wash while keeping its silhouette, so you can still see who got hit. Fiara-vs-Treenoc t00 reads well.
- Big damage number with a heavy outline; STUN chip appears in the top row at once.
- pax vs lavax capture now lands (r38: never landed in 40 steps).

Still weak, ordered by value:
1. Numbers too small relative to life: "7" on a 571 bar moves it a pixel. Street Fighter's light hit still chips visibly. Idea: show a brief white "lost life" ghost segment on the foe bar so the hit reads on the HUD.
2. Duplicate number: at t00 a second small "7" floats about 150 px to the right of the big one (Fiara hit, and the "9" on the Tour hit). Looks like a stale or double pop. Check hit-juice spawns one number only.
3. Multi-hit stacking (Pax vs Lavax t02): "3", "38", "8" overlap into an unreadable blob over the foe; stagger the pops or merge them into one growing total (combo counter).
4. The white core is a flat disc with no texture; at lava stage with a bright core it hides the foe's face for ~8 ticks. Smaller core, brighter ring, more shards.
5. Attacker does not move: no lunge or recoil, only the foe moves (same as r38 note). Even a 4 px forward nudge plus 1-frame stretch on the attacker would add weight.
6. No screen shake on a plain hit (reserved for supers is fine, but a 1-2 px 3-frame nudge is what MvC light hits have).
