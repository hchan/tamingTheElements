---
status: done
added: 2026-11-14
---

# Life bar fill does not match the Life number

Sindarosa reads 'Life 210/210' but the bar is about 40 to 63 percent full (Tour fight and 2v2). Either scale bars to the largest max life or show the max honestly. Life totals are also very uneven (Sindarosa 272 vs Pax 727). Shots: 2v2-start.png, scr-d-tour-fight.png.

Progress: 2026-11-14 done. Bars are now full lane length for every hero (fill = life / own max, matching the Life n/max label); the r15 scaledBar shortening is removed. Uneven max life across heroes (Sindarosa 272 vs Pax 727) is sim data in src/core and unchanged.
