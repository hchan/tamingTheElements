---
status: done
added: 2026-11-11
---

# Auto-face the opponent on attack

Default: an attack faces the nearest opponent whatever way the hero was moving (Street Fighter feel). Holding a direction (8-way) at cast time overrides it.

Arcade only: change `castDir` in `src/core/sim/systems/arcade/aim.ts`; `SIM_VERSION` bump; re-record Arcade goldens with a stated reason; Classic stays byte-identical. Backlog row: FUN-DESIGN WP 37. Owner approved 2026-11-11.
