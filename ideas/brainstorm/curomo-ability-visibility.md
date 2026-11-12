---
status: planned
added: 2026-11-11
---

# Make Curomo's ability easy to see

Owner request 2026-11-11: Curomo's ability is hard to see. Ice Shock (`src/core/data/abilities-b.ts`, melee 240x40) draws only the small `iceShock.png` (80x32); Shards of Ice (`abilities-a.ts`) is similar. Make both clearly readable (size, brightness, element colour, a hit flash), view only (no sim change), and verify with screenshots taken in the real game (`?ff=play`, play-local skill). Check size budgets in `tools/ci/size-budget.json`.
