---
status: idea
added: 2026-11-19
---

# SOLID refactor audit: what is done and what remains

Source: the planners' audits in `.scratch/plans/solid-arena.md` (`src/game/scenes/Arena.ts`, 1288 lines) and `.scratch/plans/solid-hud.md` (`src/game/scenes/Hud.ts`, 1245 lines). Each step is one work package, ranked and independent.

## Rules for every step

- Pass a context object (scene, view, prefs, callbacks), never `this`.
- Pure moves: no behaviour change, draw order, call order and depth literals stay byte-identical.
- One agent per shared file (Arena.ts, Hud.ts, REPO-MAP, size budgets).
- Ratchet the caps in `tools/ci/size-grandfather.json` down as each file shrinks.
- Arena keeps the scene lifecycle, the `advance()` order and the `update()` order. Hud keeps lifecycle, update orchestration, prefs and the `text()` factory (share it via `hud/hud-text.ts`). Arena calls `Hud.comboBoxes/heroLabels/numberBoxes/popBoxes/textSizes` by name, so keep delegating methods.

## Done so far

- HudChrome (scrim, edge grain)
- tall-fills (`mountTallFills`)
- swap-feedback (refusal/swap notice)
- arena-probe (`installArenaProbe`)

## Remaining Arena steps

1. arena-input (M): `buildLocalInput(scene, launch, deps)` for keyboard, second player, action bars, pause dialog, announcer, clicks, cleanups. Risk: cleanup order, pause releaseAll. Specs: tester-mode, arcade-tag, versus-hero-pick, hud-labels-sf.
2. lazy-views (M): `mountLazyViews` (rounds, terrain, poses, ccFeed, cleanseFx, motion sinks). Risk: async import stale-scene guards (`arcadeHud===hud`, `view===view`) and mount order of depth-less layers. Specs: round-result, stage-hazards, own-element-fx, arcade-trap, callout-pop-lanes.
3. arena-sim-feed (L, high risk): `TickPipeline.consume(events, {sound})` holding the fixed fan-out order (fx, cleanse, audio, casts, announce, rounds, terrain, poses, ccFeed, motion). Highest value; order, lingerSession and online (session.update, pacer, playOnce) must stay byte-identical; step/record/tester cheats stay in Arena. Specs: golden/determinism unit, online e2e, round-result*, replay playback, ko-fx-shot.
4. arena-draw (M, highest draw-order risk): `FrameDrawer` (samplePos, drawCharacter, drawProjectile, drawMelee, simPositionOf). Characters before projectiles then melee; teamElement/casterShift written by characters before melee. The probe should call `drawer.frame()`. Specs: pseudo3d-*, hero-scale, sprite-sheets, super-impact-shot.
5. playback-controller (S): attachPlayback/reportPlayback plus speed/slowFrame; do together with arena-sim-feed.

onShutdown shrinks as each owner gets `destroy()`; `create()` shrinks to composition.

## Remaining Hud.ts items (ranked)

1. `hud/combo-placer.ts` (ComboPlacer, about 330 lines, risk medium; draw order meters, combos, numbers; shares numberObstacles with 2). Tests: e2e combo-anchor, callout-pop-lanes, arcade-juice; unit combo-anchor.
2. `hud/damage-numbers.ts`: number loop of drawArcade; needs obstacles from 1 via an interface, do with or after 1.
3. `hud/life-label-fit.ts` (low risk; keep the setSlimLabel-before-drawMeter call order). Tests: life-readout, portrait-play, slim-hud.
4. `hud/status-chip-view.ts` (medium; CHIP_RECTS_KEY registry consumed by buildCeil; depth 102). Tests: status-icons, buffs, arcade-tag.
5. `hud/life-bar-renderer.ts` (low-medium; stroke order inside gfx is draw order). Tests: hud, classic-hud.
6. `hud/portrait-view.ts` (medium; back vs gfx layering, depths 98/99/100). Tests: element-mark, tag-view, portrait-play.
7. `hud/meter-view.ts`: coupled to 3 (meterTight) and 4 (portraitBottom); do after 3.

## Later targets

- `pose-layer.ts` (FX lane)
- `arcade-versus.ts`
- then the `src/core` files: an Opus max-effort planner first (sim and golden risk), Sonnet builds.
