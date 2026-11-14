---
status: idea
added: 2026-11-12
---

# Stage choice and hazards

The Versus stage picker shipped (see [versus-stage-picker](../done/versus-stage-picker.md)). Still open: per-stage hazards and ambient motion (wind, lava, tides) that stay deterministic in the sim. Pairs with tilemap-environments and arena-panning.

## Progress

- 2026-11-14: ambient motion done (presentation only): per-stage soft particles behind the fighters (fire embers and heat, water motes and caustic glints, earth dust and falling grit, air wisps, void motes), capped at 48, off under reduced motion (`src/game/fx/stage-ambient*.ts`, `tests/e2e/stage-ambient.spec.ts`).
- Open: hazards with gameplay (wind, lava, tides) that stay deterministic in the sim.
