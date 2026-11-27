---
status: idea
added: 2026-11-15
---

# Melee wall hold and drawn overlap

The melee hold distance (32 px) is measured on sim boxes. With the k=2 drawn hero the sprites can still overlap visually at the wall. Consider a hold on drawn extents.

## Progress note (2026-11-26, sim-side finding, no code changed)

Checked main (7a8efd0f): not fixed, and not a view problem. The 32 px melee hold is `ARCADE_AI_WALL_HOLD_MELEE_PX` in `src/core/agents/scripted-ai/arcade-ai.ts` (`wallHold`, called from `ArcadeAi.wallHoldStep` in `arcade.ts`, Hard AI only). It is a sim AI command rule on sim boxes (`self.x/w`, `opp.x/w`). The view commits (opaque-bbox-tuck 48a63fa7, WALL-3a 7202ac92) only change where the drawn body is clamped and tucked; they do not alter the AI gap, so a drawn sprite wider than its sim box can still overlap at the wall.

What a fix needs: the hold must use drawn half-extents, which means `src/core` would need per-hero drawn width data (today only in `src/game/views/hero-scale.ts` and the opaque-span scan, outside core) or a new LUT in `src/core/data`, then `wallHold` adds `(drawnW - w)` per side to `hold`. Files: arcade-ai.ts, arcade.ts (arg), a new core data table, arcade-wall.test.ts, SIM_VERSION bump (version.ts).
Golden impact: Hard AI commands change near side walls, so Arcade replay goldens with Hard AI, balance baselines (`balance:record`) and fun-gate bands move; needs SIM_VERSION 120 and a stated re-record reason. Alternative with no sim change: purely cosmetic nudge of the drawn sprites apart in the view (would break sim/view agreement, not recommended).
Left in brainstorm for a planner (Opus, risky tier).
