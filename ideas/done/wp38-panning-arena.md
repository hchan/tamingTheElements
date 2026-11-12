---
status: done
added: 2026-11-12
---

# WP 38: panning wide arena (SF2-style)

Make the Arcade arena wider than the 1280x720 screen, with a camera that pans to keep both fighters in view, as in Street Fighter II. Built (WP 38a to 38f, 2026-11-12): arena 1920 wide (SIM_VERSION 32), view-only camera, `tests/e2e/arcade-pan.spec.ts`; docs in FUN-DESIGN 2.1 and ARCHITECTURE. The text below is the original design. Related: [pan and traps memory note], FUN-DESIGN 2.1 (playfield insets), `ideas/in-progress/tilemap-environments.md` (the arenas the art must fit).

## Current state (read from the code)

- The sim arena is `world.arena` (an `Aabb`): Arcade uses `arcadePlayfield()` in `src/core/data/arcade.ts` = `x 0, w ARENA_WIDTH (1280), y 200..640`. `ARENA_WIDTH`/`ARENA_HEIGHT` live in `src/core/data/chapters.ts`. Movement, projectiles, capture and `arcade/knockback.ts` all clamp against `world.arena`; none hard-code 1280.
- Hard-coded 1280 in core: spawns (`match.ts` `P2_START_X = ARENA_WIDTH - 160 - CHARACTER_WIDTH`; `terrain-layout.ts` `SPAWN_X`, pinned equal by a test) and terrain generation (point-symmetric about the playfield centre, patches inside the playfield).
- The view is a fixed 1280x720 logical canvas: `fitScene` (`src/game/boot/viewport.ts`) sets `cameras.main` zoom = resolution and `centerOn(640, 360)`. The HUD is its own scene (`scenes/Hud.ts`), so it is already screen-fixed.
- `fx/super-view.ts` already drives the main camera (`setZoom(res * z).centerOn(...)`) for the super cut-in, so it will collide with a pan camera unless it composes with it.
- AI (`scripted-ai/index.ts`, `arcade.ts`) reads walls from `arcadePlayfield()` and uses relative dx/dy, so it is width-agnostic except `CHARGE_AI_MIN_DIST` and range thresholds tuned on a 1280 arena.

## Decision: sim widens the arena, camera is view-only

Two options:

1. View-only (keep the 1280 sim, just zoom/pan): pointless, the fighters would still be 1280 apart at most and nothing would pan.
2. **Widen the sim arena, add a view-only camera (chosen).** Only the playfield width and spawn/terrain constants change in `src/core`; the camera is pure presentation and adds no sim state, so it needs no hash, snapshot or replay support and cannot desync.

Arena width: `ARCADE_ARENA_WIDTH = 1920` (1.5 screens; integer, tunable in one constant). Make `arcadePlayfield()` use it instead of `ARENA_WIDTH`; leave `ARENA_WIDTH` (Classic, 1280) untouched so Classic goldens and `classic-hash-pins` are unaffected. Spawns become `ARCADE_SPAWN_INSET = 160` from each wall: `P1 x = 160`, `P2 x = W - 160 - CHARACTER_WIDTH`. That puts the fighters 1520 px apart at start, wider than the 1280 screen, so the camera must zoom out slightly at the start (see rules). Alternative (smaller) first step: keep spawns at the old 1280-wide positions centred in the wider arena (`x0 = (W-1280)/2`), so round start looks identical to today and pan only matters after movement. Recommended for step 2; wider spawns are a later tuning WP.

All new numbers are integers, no trig, no division at sim level (`W` is a constant). Terrain layout keeps its point-symmetry about the playfield centre (centre now `W/2`); it uses `arcadePlayfield()` so it follows automatically, but `SPAWN_X` must be derived from the same constants (and the equality test updated).

## Camera rules (view only, `src/game/fx/arena-camera.ts`, pure function + thin Phaser shell)

Pure function `cameraTarget(fighters, prev, dt)` returns `{ centerX, zoom }`, unit-testable without Phaser. The pure part may use floats (view code is not under the `src/core` lint rule) but must not feed back into the sim.

- **Follow the midpoint** of the two live fighters' centres (in 2v2 tag, the active fighter of each team; benched fighters ignored). Target `cx = (x1 + x2) / 2`.
- **Smoothing:** exponential ease toward the target (about 0.15 per frame at 60 fps, written frame-rate independent via `dt`); optional small look-ahead of the faster fighter's velocity. No smoothing on a round reset: snap (cut) to the start framing.
- **Clamp:** the view's left edge never goes below world `x = 0` and right edge never above `W`, so the walls show and the camera never reveals void. At zoom `z` the visible width is `1280 / z`; clamp `centerX` to `[vw/2, W - vw/2]`.
- **Margin:** keep each fighter at least `MARGIN = 160` px inside the visible edge.
- **Max separation and zoom:** if `|x1 - x2| + 2*MARGIN` exceeds the visible width, zoom out (`z < 1`) down to `ZOOM_MIN = 1280 / 1600 = 0.8`; zoom eases back in when they close. If separation exceeds what `ZOOM_MIN` shows, the larger fighter is not an issue because of the next rule. **Hard rule:** the arena is capped so that the two fighters can always both be in view at `ZOOM_MIN`; this is why the arena width is 1920 and not 2560 (view width at 0.8 zoom = 1600, plus the 2 x 160 margins needs separation <= 1280; fighters farther apart than that will see one of them nearer the edge, never offscreen, because a fighter cannot leave the arena and the clamp keeps walls visible). If playtest shows this is too tight, options are: invisible "screen walls" in the sim (the SF2 solution: fighters cannot be more than `MAX_SEPARATION` apart; a sim change, needs SIM_VERSION), or a smaller arena. Start without screen walls; measure real separations from `sim:match --tournament` first (add a max-separation metric to the report).
- **Vertical:** no vertical pan; the playfield is y 200..640 and fits at all zooms. The camera Y stays centred on 360 so the Hud scene bars and the action bar stay aligned (zoom-out reveals extra world above and below: fill it with the backdrop, which must be taller than 720 by `720 * (1/z - 1)/2` = 90 px each side at 0.8).
- **Reduced motion:** the setting that disables screen shake also disables smoothing and zoom changes (pan snaps, zoom fixed at 1).
- **Super cut-in:** `super-view.ts` currently overwrites `cameras.main` zoom/centre; make it compose (`baseCamera` from `arena-camera` times the super zoom) or pause the pan during the cut-in and restore after.

## Files that change

Sim (small):
- `src/core/data/arcade.ts`: `ARCADE_ARENA_WIDTH`, `PLAYFIELD.w`, spawn constants; export for the view.
- `src/core/sim/match.ts`: Arcade `P2_START_X` and any start X use the new constants (Classic path unchanged).
- `src/core/sim/systems/arcade/terrain-layout.ts`: `SPAWN_X` derived from the Arcade constants; test pinning the equality updated.
- `src/core/version.ts`: `SIM_VERSION` 31 -> 32. Re-record the 5 Arcade goldens (`pnpm golden:record`, stated reason in the commit); Classic replays unaffected (header only). `docs/DETERMINISM.md` version table and `balance:record` baseline (Arcade win rates shift: more room for ranged, `CHARGE_AI_MIN_DIST` etc.).
- `src/core/index.ts` export list (shared file, one agent only).

View:
- new `src/game/fx/arena-camera.ts` (+ test), wired from `src/game/scenes/Arena.ts` (per-frame update after the sim view is applied; reset on round start/restart/teardown; `__TTE__` hook exposes camera `{scrollX, zoom}` for e2e).
- `src/game/boot/viewport.ts`: `fitScene` stays the Hud/menu default; Arena scene stops using a fixed `centerOn(640,360)`.
- `src/game/views/backdrop.ts` and `src/game/fx/terrain-view.ts`, `terrain-floor.ts`, `weather-view.ts`: draw width from `ARCADE_ARENA_WIDTH` instead of `LOGICAL_WIDTH`/1280 (sky tint rect must cover the zoomed-out view, so use `setScrollFactor(0)` or size it to the world); `defence-view.ts` clamp.
- Screen-space layers: weather sky tint, super dim and band, round banners (`hud/round-view.ts`), low-life vignette: confirm each uses scrollFactor 0 or the Hud scene so the pan does not drag them.
- Parallax (optional later): far backdrop layer `scrollFactor 0.5`.

HUD, touch, input:
- HUD (`hud/arcade-hud.ts`, `scenes/Hud.ts`): unchanged in layout (screen-fixed scene). Floating damage numbers and name tags that live in the Arena scene are world-space and pan naturally; check `hud.spawn` positions use world coords.
- Touch controls (DOM overlay, `src/ui`, buttons and pad): screen-space, unchanged. Pointer to world conversions (any tap-to-aim or tester drag) must use `cameras.main.getWorldPoint` instead of dividing by the canvas size; grep `pointer` in `src/game` and `src/ui/tester`.
- Off-screen indicator (view only, later): arrow at the screen edge if a projectile or fighter is outside the view at max zoom-out.

AI:
- Width-agnostic, reads walls from `arcadePlayfield()`. Re-check distance thresholds (`CHARGE_AI_MIN_DIST`, `ARCADE_AI_PRESS_MIN_PX`, spacing bit, chase) for a 1920 arena; an AI that sits in a corner and out-ranges its opponent could produce 1500 px separations. AI is not sim state, so no SIM_VERSION effect by itself, but the `balance:compare` baseline changes.

Docs: `docs/FUN-DESIGN.md` 2.1 (playfield), `docs/ARCHITECTURE.md` (Arcade arena width, camera is view-only), `docs/REPO-MAP.md` (test pins it) for the new file, `tools/ci/size-budget.json` (shared file, one agent only).

## Test plan

Unit (Vitest):
- `arena-camera.test.ts`: midpoint follow; clamp at both walls; margin; zoom-out at max separation and back; `ZOOM_MIN` floor; reset snap; frame-rate independence (same end state at 30/60/144 fps within a tolerance); reduced motion path; deterministic given the same inputs.
- `arcade-playfield-hud.test.ts` updated (insets unchanged, width new). `playfield.test.ts` / `terrain.test.ts`: fighters, knockback, dashes, projectiles and patches stay inside the new width; point symmetry of the layout about `W/2`; `SPAWN_X` equals match start X.
- Property test: arbitrary input streams never leave the playfield (existing `sim.property.test.ts` extended for Arcade).
- Golden replays (Node, and the browser trio): re-recorded once; `replay-fixtures`, `classic-hash-pins` (must be unchanged), `sim-perf` and `alloc` still pass.
- `balance:compare` before/after, record with reason.

E2E (Playwright, one worker, several runs in a row):
- `arcade-pan.spec.ts`: start match, hold move toward one wall with `?manual=1` input, assert via `__TTE__` that camera `scrollX` increases and stays within `[0, W - viewW]`; opponents at max separation both inside the view; round restart snaps the camera; super cut-in then restores the pan; touch layout (small viewport) still shows both fighters and the HUD.
- Existing Arcade specs (arcade, local, rounds, super, terrain, weather) keep passing; wait on `__TTE__.settled()` for teardown.

Screenshots (real game, play-local skill, `?ff=play`): fighters at start (equal framing), one at the left wall, both far apart at zoom-out, at the right wall, super cut-in during a pan, phone-size viewport; check the backdrop covers the zoomed-out edges, terrain patches, HUD alignment and the weather tint. Save under `tests/visual` baselines if that suite takes Arcade shots.

## WP breakdown (small commits, gate before each; one agent per step, serial on shared files)

1. **WP 38a: camera module, no behaviour change.** `arena-camera.ts` pure function + unit tests; no wiring. Size budget bump here.
2. **WP 38b: view plumbing at 1280.** Wire the camera into `Arena.ts` at `W = 1280` (clamp pins it, so the picture is identical); `__TTE__` camera hook; super-view composes with it; screen-space layers audited and fixed; screenshot proves no change. No sim change, no golden change.
3. **WP 38c: backdrop and layers world-width ready.** Backdrop, terrain art, weather tint and defence-view clamp take the width from one constant (still 1280); backdrop taller for zoom-out.
4. **WP 38d: sim widens the arena (SIM_VERSION 32).** `ARCADE_ARENA_WIDTH = 1920`, spawn constants (centred 1280 spawn variant first), terrain `SPAWN_X`, tests, `golden:record` with reason, DETERMINISM.md version note. Classic untouched. Gate incl. `test:legacy`.
5. **WP 38e: AI and balance.** Re-tune AI thresholds, `balance:compare`, `balance:record` with reason, measure max separation; decide on sim screen walls (a possible WP 38g, SIM_VERSION 33) from the data.
6. **WP 38f: e2e + screenshots + docs.** `arcade-pan.spec.ts`, visual shots, FUN-DESIGN 2.1, ARCHITECTURE, REPO-MAP, size budget; ideas file moved to `done/`.
7. Later ideas (own files in `ideas/`): wider real spawns, parallax layers, off-screen indicators, per-stage arena widths, interaction with the SF2 bomb/trap WP (traps live in world coordinates, so they pan for free).

## Risks

- Zoom-out shrinks sprites on phones that are already about 0.3x scale: keep `ZOOM_MIN` 0.8 and consider a phone-only cap.
- Super cut-in and shake both drive `cameras.main`; double ownership is the likeliest bug (step 2 owns it).
- Online (rollback) matches: the camera is view-only so it needs no netcode work, but the `SIM_VERSION` bump invalidates old replays and handshakes (expected).
