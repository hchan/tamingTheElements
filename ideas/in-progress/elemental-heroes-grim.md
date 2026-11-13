---
status: in-progress
added: 2026-11-13
---

# Ishimi, Morblass and Echo as grim elemental beings

Owner directive: not humanoid. Ishimi is a hunched mass of dripping murky slime with tendrils and many glowing eyes, Morblass a towering glacier beast of jagged blue ice with eyes frozen inside, Echo a hollow spiral vortex of pale air with concentric sound-wave rings and a calm glowing eye. Desaturated, textured, no outlines, matching Fiara's rigged and baked look.

Done (2026-11-13): generators `tools/assets/rig-gen/{ishimi,morblass,echo}.py` rewritten, rigs baked, sheets packed (same layout, 3 actions x 4 frames x E/SE/NE). Headless screenshots: `tests/e2e/elemental-heroes-shot.spec.ts` (SHOT_DIR=dir).

Next: Echo is small and faint on the dark Fire floor (the eye carries it); the cast-frame tendril and spur show nearest-neighbour rotation jaggedness; check readability on Air and Water floors.
