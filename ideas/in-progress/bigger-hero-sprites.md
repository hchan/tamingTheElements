---
status: in-progress
added: 2026-11-13
---

# Giant heroes (in progress)

Owner feedback: heroes were about 60 px in a 1750 px arena and got lost. Fighting games keep fighters at about a third of the screen height.

Done (view only, sim coordinates unchanged):
- Arcade heroes drawn at 2x about the feet centre (`src/game/views/hero-scale.ts`, `arcadeHeroScale`; giants capped near 200 px).
- Soft elliptical ground shadow per hero (`CharacterView.placeShadow`).
- FX that hug the body (status marks, auras, embers, aim ring, dash afterimage) use `visualBox`.
- Hit flash, hit-stop, camera shake and breathing already existed (event-fx, motion, pose-layer) and honour reduced motion.

Open: Classic keeps its 1.4x; hit-spark anchors in defence-view still use the sim box; tune shadow strength.
