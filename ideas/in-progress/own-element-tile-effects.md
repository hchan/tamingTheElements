---
status: in-progress
added: 2026-11-13
---

# Hero standing on a tile of its own element

Owner request (2026-11-13): when a hero stands on a stage patch of its own element, show an animation, and one for each element:

- Water: healing animation (the sim already heals TERRAIN_WATER_HEAL_PM every TERRAIN_WATER_EVERY ticks; the view needs a visible heal effect on the hero).
- Fire: some kind of animation (the sim already deals the fire damage bonus; view needs a flame aura).
- Air: some kind of animation (the sim already gives TERRAIN_AIR_PM speed; view needs wind swirl/streaks).
- Earth: earth heroes get a 25% armour bonus on their own patch (NEW SIM RULE: earth patches are rocks for the other elements today), plus an animation (stone plates / dust shield).

Progress: WP 1 DONE (2026-11-13: `src/game/fx/own-element-fx.ts` + `own-element-view.ts`, lazy chunk mounted by the Arena; in-patch and the water heal tick are derived view-side from `RenderArcade.stage/patches` and an HP rise, no new RenderView field; reduced motion = static glow; e2e `tests/e2e/own-element-fx.spec.ts`). WP 2 (sim, earth armour) is OPEN; the earth effect carries no label yet.

Split in two work packages:
1. View only (no sim change): the four own-element-on-patch animations, driven by the existing in-patch state in `RenderView`. Grim, desaturated, painterly; respect reduced motion.
2. Sim (queue after the balance retune merges, only one sim-changing agent at a time): earth armour +25% (damage taken x0.75 or the armour stat x1.25, decide from docs/FUN-DESIGN 2.15 and mitigation), expose it to the view, SIM_VERSION bump, goldens/baselines re-recorded with a stated reason, ability/terrain docs and the Guide updated.
