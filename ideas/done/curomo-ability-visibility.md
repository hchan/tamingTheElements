---
status: done
added: 2026-11-11
---

# Make Curomo's ability easy to see

Owner request 2026-11-11: Curomo's ability is hard to see. Ice Shock (`src/core/data/abilities-b.ts`, melee 240x40) draws only the small `iceShock.png` (80x32); Shards of Ice (`abilities-a.ts`) is similar. Make both clearly readable (size, brightness, element colour, a hit flash), view only (no sim change), and verify with screenshots taken in the real game (`?ff=play`, play-local skill). Check size budgets in `tools/ci/size-budget.json`.

## Progress

Done 2026-11-14 (view only, no sim change). Ice Shock already had the 240x72 painted lance, 1.8x draw and the Water impact strip on hit (earlier commits); this adds a pale-cyan additive halo (`SPRITE_BOOST.iceShock`, alpha 0.55 vs the 0.2 melee default) and, for Shards of Ice (Classic ruleset only; Arcade swaps it for Snag), a 64 px minimum draw plus a wide icy halo (`SPRITE_BOOST.shardsOfIce`). Before/after headless screenshots via `SHOT_DIR=... pnpm e2e -g curomo` (cases added to `tests/e2e/ability-fx.spec.ts`); Shards of Ice itself could not be shot in Arcade, covered by unit tests in `projectile-view.test.ts`.
