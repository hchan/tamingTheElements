---
status: done
added: 2026-11-13
---

# Guide screen: common abilities, weather, and the element damage circle

Owner idea (2026-11-13): a separate menu screen showing the COMMON abilities (and the elemental-common ones, an idea in the works), the WEATHER, and the circle of damage between elements (e.g. water does more damage to fire), as a graphical, gamer-style display (not prose). Marked "escalate".

## Sketch

- One screen reachable from the menu (Help area, no new top-level entry beyond Play, Versus, Online, Settings, Help).
- Element wheel: four elements in a circle with arrows and multipliers read from the sim's damage table, so it cannot drift.
- Common abilities as icon cards (key, cooldown, one-line effect); elemental-common ones shown per element.
- Weather: each element's weather as a card with a small animated preview, what it changes on the stage, and who it favours.
- Reuses the grim icons from the action bar and the portraits from [[mvc-character-select-with-ability-info]].
- Works at 1280x720, 800x450 and touch.

## Progress

Shipped as the Guide page linked from Help (src/ui/screens/guide*.ts, styles/guide.css, tests/e2e/guide.spec.ts, unit tests). 2026-11-14: added the OS prefers-reduced-motion guard for the weather previews; removed the stale brainstorm duplicate.
