---
status: done
added: 2026-11-15
---

# fire-blast-trail-fade

Fade the Fire Blast trail and impact fx with the damage falloff (view only). Follow-up of [FUN-DESIGN 2.27](../../docs/FUN-DESIGN.md).

Done: trail puffs and the end-of-flight burst in `src/game/views/pose-vfx.ts` now scale with the sim alpha (`alphaPm`) through the pure curve in `src/game/fx/fire-blast-fade.ts` (alpha and size down to 35Done: trail puffs and the end-of-flight burst in `src/game/views/pose-vfx.ts` now scale with the sim alpha (`alphaPm`) through the pure curve in `src/game/fx/fire-blast-fade.ts` (alpha and size down to 35 percent, burst motes down to 61 percent); screenshot spec `tests/e2e/fire-blast-fade-shot.spec.ts`. The victim-side hit impact is not scaled (the hit event carries no blast age).
