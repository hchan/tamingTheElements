---
status: idea
added: 2026-11-14
---

# Plain hits still feel light (third round running)

Hit flash and numbers are fine, but a basic strike lacks weight next to Street Fighter: little hitstop and screen punch on normal hits. Idea: a 2-3 tick freeze plus a tiny camera nudge scaled by damage on non-super hits.

## Progress

2026-11-14: Presentation-only pass done. Every plain hit now throws a directional streak fan (3/5/7/9 by strength, `hit-streak-view.ts`), squashes and shoves the victim about its feet (`recoilPose`, view-tick keyed), nudges the camera even on light hits, and the arcade thump cue is louder with a noise crack layer. All skipped under reduced motion. Unit tests added; a headless shot confirmed the victim squash, but the streak fan was not clearly visible in the arenaDemo projectile shot, so it stays in brainstorm pending a closer look at melee hits. Sim hit-stop length is unchanged (sim-side, out of scope).
