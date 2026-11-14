---
status: planned
added: 2026-11-13
---

# Super cinematic dims the stage, hides the foe and shows the wrong portrait

Severity: medium (fun/readability). The banner (HELLFIRE LANCE, EYE OF THE STORM, CRIMSON TIDE) darkens the stage and hides the opponent, so the hit is not seen. The banner portrait looks like Pax rather than the casting Lavax.

Fix: dim less, keep both fighters lit, use the caster's portrait, SF-style freeze and zoom on the pair.

Screenshot: ~/claudetmp/qa/r3/water2-5super0.png.

Done 2026-11-13: dim 0.6 -> 0.2 and the cut-in band at 50% opacity, so the foe stays visible. Still open: the banner uses the caster pooled sprite frame (character-view.ts) rather than a dedicated portrait; SF-style freeze zoom on both fighters.
