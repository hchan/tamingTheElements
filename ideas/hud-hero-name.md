---
status: in-progress
added: 2026-11-11
---

# Show the active hero's name on the HUD

Owner request 2026-11-11: the avatar and health bar of the active hero must also show the hero's name (both teams, solo and tag, Arcade and Classic). Use `heroName(sprite)` from `src/game/hud/tag-fx.ts`; draw in `src/game/scenes/Hud.ts` (`drawArcadeAvatar`, label next to the health words) without overlapping the health text (y 22) or the meter row. Needs a unit test and a doc line.
