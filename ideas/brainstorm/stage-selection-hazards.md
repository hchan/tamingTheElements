---
status: idea
added: 2026-11-12
---

# Stage choice and hazards

The Versus stage picker shipped (see [versus-stage-picker](../done/versus-stage-picker.md)). Still open: per-stage hazards and ambient motion (wind, lava, tides) that stay deterministic in the sim. Pairs with tilemap-environments and arena-panning.

## Progress

- 2026-11-14: ambient motion done (presentation only): per-stage soft particles behind the fighters (fire embers and heat, water motes and caustic glints, earth dust and falling grit, air wisps, void motes), capped at 48, off under reduced motion (`src/game/fx/stage-ambient*.ts`, `tests/e2e/stage-ambient.spec.ts`).
- 2026-11-14: first gameplay hazards (SIM_VERSION 54, `src/core/sim/systems/arcade/hazard.ts`): one telegraphed hazard per element stage, a 1 s pulsing warning then the strike. Fire: a lava lane (4% max HP); water: a tide drift; earth: a rockfall on a fighter (5%); air: a gust band that nudges dashing or knocked-back fighters harder. It never KOs, skips invulnerable fighters, uses seeded sfc32 and tick timing, and Classic is untouched. Renderer: `src/game/fx/hazard-view.ts` (muted, steady under reduced motion), with a rumble on the warning and a crash on the strike (`arcade-cues.ts`); headless shots in `tests/e2e/stage-hazards.spec.ts`. Win rates moved within noise.
- Open: the AI does not dodge hazards yet. Also open: tuning (period, damage, gust strength), a screen-reader announcer line for the warning, painted per-hazard art in place of the drawn shapes, and a stronger fire-lane warning when the lane sits at the camera edge.
