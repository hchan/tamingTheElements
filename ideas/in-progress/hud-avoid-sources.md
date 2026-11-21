---
status: in-progress
added: 2026-11-19
---

# More HUD avoid sources

Publish more rects (terrain hazards, tutorial prompts) to the tte.hudAvoid registry so the anchored counter stays clear of them. Follow-up to [combo-counter-anchoring](../done/combo-counter-anchoring.md).

## Progress (2026-11-20)

Done: the hazard warning chip (LAVA/TIDE/ROCKFALL/GUST + seconds) now publishes its box in HUD px to slot 1 of `tte.hudAvoid` (`chipAvoidRect`, `publishAvoidSlot` in `src/game/fx/hazard-view.ts`), cleared when the chip hides or the view tears down. Unit-tested (`hazard-view.test.ts`). Not done: tutorial prompts as a source; no screenshot check that the combo counter actually dodges the chip. Status stays in-progress.
