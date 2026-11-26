---
status: done
added: 2026-11-19
---
# Fire stage: fire heroes blend into the floor (r128)

`.scratch/qa-r128/10-stage-Fire.png` and `31-2v2.png` (1280x720): the Fire stage floor is orange-brown with glowing cracks, and Sindarosa (red-orange) and Fiara (red-yellow flame) sit on the same hue, so the silhouette is weak next to the Rokcore grey on the same screen. The fire aura triangles around Sindarosa are also faint against the glowing cracks and the trap warning marks. SF and MvC keep fighters apart from the stage with value contrast.

Suggestion: darken and desaturate the floor in a band around the fighters' lane, or add a thin dark under-glow or rim to fighters on the Fire stage. Keep the lava cracks away from the centre lane. Check with a fire hero against a fire stage, not only mismatches.

triaged: 2026-11-21 real, medium art/render: rim or lane darkening on the Fire stage; art-director gate applies.

## Progress note (2026-11-26)

Already fixed by `src/game/fx/stage-shade.ts` (merge a5d8eeeb4, 2026-11-19): a soft dark umber pool under each fighter on the Fire stage (render only, no src/core). Added behaviour tests (`mountStageShade`: one pool per fighter on Fire, none on other stages or under high contrast). Verified with a real-game 1280x720 headless shot (`arcade-stage-floors` fire spec, PC): Sindarosa reads clearly against the orange floor. Shot: `.scratch/r128/after-fire-sindarosa.png`.
