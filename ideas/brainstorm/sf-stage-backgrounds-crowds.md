---
status: idea
added: 2026-11-12
---

# Living stage backgrounds

Source of the idea: Street Fighter II / Marvel vs Capcom. SFII stages have crowds, animals and ambient motion. Parallax layers with a cheering crowd that reacts to supers and KOs; element-themed (volcano, storm sea, desert, sky temple).

## Progress (2026-11-12)

First slice done: parallax stage backdrop (far skyline, drifters, cheering crowd) per element above the arena wall, src/game/fx/terrain-stage*.ts, art by tools/assets/stage-gen/stagebg.py. Still open: crowd reacting to supers and KOs, stage-specific foreground, fades between stages.

Second slice (2026-11-13): the crowd reacts to hits (short hop), supers (longer) and KOs (long, biggest hop), cheering twice as fast while roused; reduced motion holds it still. View only (terrain-stage*.ts, wired in terrain-view.ts), reuses the existing crowd frames. Still open: stage-specific foreground, fades between stages, per-stage reaction art (arms-up frame).
