---
status: done
added: 2026-11-12
---

# Hit stop and juice

Source of the idea: Street Fighter II / Marvel vs Capcom. A few frames of freeze on a heavy hit, screen shake, spark effects, flash on super. Pure view: slows render and input timing visuals, not the sim. Gate by reduce-motion.

Done 2026-11-12 (render side only): Classic hit shake now scales by damage (`classicShakeFor`, `src/game/fx/motion.ts`); Classic reduced motion gets a static spark. Arcade already had flash, sparks, strength shake and jitter. Headless shot: `tests/e2e/hit-juice-shot.spec.ts`. A sim-side hit-stop freeze for Classic is a core matter, not done here.
