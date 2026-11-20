---
status: idea
added: 2026-11-19
---

# Interactive how-to-play (Practice)

Owner wants Help to teach by doing: click action 1 and see it hit a dummy, see the special, highlight the icon to push, then weather, cleanse, guard, element advantage (fire beats air, air beats earth, earth beats water, water beats fire) and terrain patch effects (water heals 1 HP/s, fire x2 damage, earth rock blocks non-earth heroes and projectiles, air x2 speed).

## Status

- **Slice 1 (merged):** 4 lessons, `#tutorial` route, entered from the Help "Practice" button.
- **Slice 2 (being built):** weather, cleanse, guard and terrain-patch lessons.
- **Remaining (this idea):**
  - Persist `tutorialDone` (settings, async IndexedDB save; wait for navigation to `#main` in tests) so the menu can stop nudging after completion.
  - Escape handling: leave the lesson back to Help without losing progress or leaking the game instance (wait on `__TTE__.settled()`).
  - Ring for Melee: show the reach ring on the dummy lesson so the player sees why Melee needs closeness.
  - Per-hero lessons: see [per-hero-ability-tutorials](per-hero-ability-tutorials.md); the shared lessons here are its "ability basics" layer.

## Acceptance sketch

- Each lesson waits for the player action, shows the key prompt, and can be skipped.
- Player-facing words follow the menu rules (Snag, never Capture or ruleset).
- e2e: smoke path through the lessons plus a persistence check after reload.
