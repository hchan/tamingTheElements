---
status: done
added: 2026-11-14
---

# Versus stage picker

Done 2026-11-14. Versus has an Arena choice (Random, Fire, Water, Earth, Air) next to Opponent, Team and AI level; it is a radio group, so keyboard (arrows), mouse and touch all work. From the QA r10/r11 note "Versus offers no stage choice, so the stage depends on the seed" and the first half of [stage-selection-hazards](../brainstorm/stage-selection-hazards.md).

No sim change: the stage is drawn from the match seed, so a pick only steers the seed (`seedForStage` in `src/game/app/tour-match.ts`, the same trick the World Tour uses). Random keeps the old seed untouched, so default behaviour and every golden are unchanged. Weather still swaps the stage in the fight.

Tests: `tour-match.test.ts`, `arcade-pick.test.ts`, `arcade-versus.dom.test.ts`, `tests/e2e/versus-stage-pick.spec.ts`.

Not done (still in stage-selection-hazards): per-stage hazards and ambient motion.
