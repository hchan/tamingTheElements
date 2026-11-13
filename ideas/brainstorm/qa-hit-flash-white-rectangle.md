---
status: idea
added: 2026-11-13
---

# QA: hit flash draws a white rectangle

Severity: medium. QA evaluator pass 2026-11-13 on main 622c6619. Screenshots: ~/claudetmp/qa2/s/st1-b-hit.png, st3-b-hit.png, super-1.png

On a landed hit the target shows a hard-edged white silhouette that looks clipped to the sprite frame rather than the character outline. It reads as a glitch, not as impact. Use a tint or additive flash on the baked sprite (or a masked silhouette) and add a brief hit-stop, as in Street Fighter.
