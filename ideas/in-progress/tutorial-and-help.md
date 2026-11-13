---
status: in-progress
added: 2026-11-12
---

# Tutorial and Help

The Help menu entry needs a short interactive tutorial (move, attack, dash, guard, charge, weather, super, tag), a move list per hero and the controls reference.

## Progress (2026-11-13)

Shipped: Help page sections "How to fight" (move, attack, dash, guard, charge, weather, super, tag, trap, element), "The action bar" (live keys for 1-9, 0, -, rebinds show) and "Choosing your heroes" (select, unselect by tile / x button / Delete / drag off / gamepad B, Start waits for a full team), data in `src/ui/screens/help-guide.ts`. First-run "First blood" card in the first battle (`src/game/app/first-run-hint.ts`, flag `tte.firstRunHint` in localStorage, Got it or 15 s fade).

Still open: a real interactive practice dummy (guided steps that react to the player's inputs), a per-hero move list on Help, gamepad/touch variants of the first-run card.
