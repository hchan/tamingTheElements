---
status: done
added: 2026-11-20
---

# `?ff=play&seed=7` stays on the boot splash

Not a game bug. `?ff=play` runs `enterPlay` (src/game/app/main.ts), which calls `createGame('game', flags.arenaDemo, flags.cinematicDemo)`. With both false, `createGame` (src/game/boot/phaser-config.ts) does not register the `PRELOAD_READY` handler, so Boot -> Preload finishes loading and the scene stays on the Preload bar by design ("`false` stays on Preload"). `src/game/app/main.dom.test.ts` ("starts Phaser for ?ff=play") only passes with `arenaDemo: true`, and `tests/e2e/smoke.spec.ts` only needs the canvas (Preload draws one).

Cause of the confusion: the play-local skill said `?ff=play` is "Straight into play" and gave `?ff=play&seed=7` as the example. A check that waits for an arena (or for the splash to go) never succeeds. Use `?ff=arenaDemo&seed=7`, or `?hero=&foe=`.

Fix: play-local skill corrected. No code change; no browser run (router not needed, the cause is static).
