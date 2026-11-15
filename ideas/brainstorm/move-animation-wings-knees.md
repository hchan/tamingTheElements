---
status: idea
added: 2026-11-14
---

# Movement animation: wing flaps and bent knees

Owner request (2026-11-14):
- Winged, dragon-like elementals (e.g. Sindarosa, Cyclonius-style fliers where the art has wings) flap their wings while they move.
- Elementals with legs bend their knees while they move (a walk/run crouch bob).
- Moving backwards runs at 50% speed (sim change, handled in the hero movement pass, see [movement agent notes](qa-r41-scorecard.md) and `docs/BALANCE.md`).

The first two are presentation only (pose layer, `src/game/fx`/`pose-layer`), reduced-motion aware, no `src/core` change. Needs per-hero flags (wings / legs) and rigged-sheet pose tweaks that match the baked look.
