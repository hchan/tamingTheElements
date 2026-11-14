---
status: done
added: 2026-11-13
---

# QA: hit flash draws a white rectangle

Severity: medium. QA evaluator pass 2026-11-13 on main 622c6619. Screenshots: ~/claudetmp/qa2/s/st1-b-hit.png, st3-b-hit.png, super-1.png

On a landed hit the target shows a hard-edged white silhouette that looks clipped to the sprite frame rather than the character outline. It reads as a glitch, not as impact. Use a tint or additive flash on the baked sprite (or a masked silhouette) and add a brief hit-stop, as in Street Fighter.

Done 2026-11-13: the flash is now an additive wash (tint mode ADD, 0x6e6e6e) instead of a solid FILL, so baked shading and outline survive (src/game/views/character-view.ts). Heavy hits (Arcade strength 2-3, Classic damage 10+) hold the wash 2-4 rendered frames, a view-only hit-stop (src/game/fx/motion.ts `holdFramesFor`); the sim is never paused. Shake already scaled by strength. Reduced motion drops the hold.
