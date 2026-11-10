# Repo map

Describes the tree as it exists today (the legacy Crafty.js game). New directories are added here by the WP that creates them.

ADR index: [docs/adr/README.md](adr/README.md)

## Top level

| Path | What it is |
|---|---|
| `war/` | Legacy web root (the old App Engine wrapper is retired). The playable game lives in `war/WEB-INF/private/` |
| `war/WEB-INF/private/src/` | The 24 legacy game scripts (see [legacy/INVENTORY.md](legacy/INVENTORY.md)) |
| `war/WEB-INF/private/lib/` | Vendored `crafty.js` and `SpriteColor.js` |
| `war/WEB-INF/private/bower_components/` | Vendored jQuery |
| `war/WEB-INF/private/css/` | `main.scss`, compiled `main.css` and a Sass cache |
| `war/WEB-INF/private/img/`, `war/WEB-INF/private/snd/` | Sprite sheets, backgrounds and `.ogg` sound |
| `imgWorkArea/` | Art working files: PNG and GIMP `.xcf` sources |
| `visio/` | Balance equation diagram (`.vsd` and `.png`) |
| `tools/` | Five Perl generators for the asset manifests (`generate*.pl`, `imgHelper.pl`) |
| `tools/gen/` | Node generators for `src/core` tables: `gen-luts.ts` writes `src/core/math/lut.generated.ts` (run with `pnpm exec tsx`); `gen-design-tables.ts` fills the generated tables in `docs/GAME-DESIGN.md` (`pnpm docs:gen`) |
| `tools/assets/` | `extract-legacy-manifest.ts` vm-loads the legacy asset manifests and writes `src/game/assets/manifest.generated.json` (run with `pnpm exec tsx`); `build-assets.ts` (`pnpm assets:build`) copies the manifest's images and sounds plus the favicon into `public/`, verifying sha256 |
| `public/` | Runtime assets copied from the legacy tree by `pnpm assets:build`: `public/assets/img/`, `public/assets/snd/` and `favicon.png` (generated, do not edit) |
| `docs/` | Documentation: `BRANCHING.md`, `PARITY.md` (legacy parity checklist with test evidence), this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `.github/` | CI workflow (`workflows/ci.yml`), Dependabot config and the PR template |
| `docs/adr/` | Architecture decision records, see the [ADR index](adr/README.md) |
| `docs/legacy/` | Legacy module inventory and known-bug table |
| `.claude/` | Claude Code project config |
| `src/` | New TypeScript port (see below) |
| `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` | pnpm, TypeScript, Vite, Vitest and Playwright project config |
| `CLAUDE.md`, `README.md`, `.gitignore` | Agent instructions, readme, ignore rules |

## New code (`src/` and `tests/`)

| Path | What it is |
|---|---|
| `src/core/` | Pure deterministic simulation code: no DOM, Phaser, Date or Math.random |
| `src/core/sim/` | Typed-array (SoA) sim state with fixed capacities, snapshot/restore, snapshot ring, state hash and the lowest-id-first entity allocator |
| `src/core/sim/` | Typed-array (SoA) sim state with fixed capacities, snapshot/restore and the lowest-id-first entity allocator |
| `src/core/sim/systems/` | Per-tick sim systems run by `step` in fixed order (movement, status so far) |
| `src/core/agents/` | `Agent` interface with a read-only `ObservationView` facade, seeded random bot (own `ai.pN` stream) and replay agent |
| `src/core/replay/` | Replay file format (header, RLE inputs, hash checkpoints every 50 ticks), recorder, verifying player and the bot-match helper behind the golden fixture in `tests/fixtures/replays/` |
| `src/core/agents/scripted-ai/` | Ports of the legacy EnemyCharacter AI as agents; `attack.ts` has attack direction, axis and range checks and the primary/secondary preconditions |
| `src/core/save/` | Save schema v1 (valibot), v0 to v1 migration and `migrate()`; format in [SAVE-FORMAT.md](SAVE-FORMAT.md) |
| `src/game/` | Phaser renderer and app glue (browser only); `src/game/app/` is the composition root |
| `src/game/platform/` | Leaf module for browser-platform glue (UI feature flags, test-only `window.__TTE__` hook); imports only core via its index |
| `src/game/platform/storage/` | Save persistence: `SaveStore`, `StorageAdapter` (localStorage / in-memory), raw v0 backup, export/import |
| `src/game/assets/` | Generated legacy asset manifest (`manifest.generated.json`), typed keys (`keys.ts`) and the pure `manifestToLoadList` (`load-list.ts`) used by the Preload scene |
| `src/game/platform/storage/` | Save persistence: `SaveStore`, `StorageAdapter` (localStorage / in-memory), IndexedDB store with localStorage mirror, raw v0 backup, export/import |
| `src/game/assets/` | Generated legacy asset manifest (`manifest.generated.json`) and typed keys (`keys.ts`) |
| `src/game/boot/` | Phaser boot: WebGL check, error screen and game config (`phaser-config.ts` is the only file that pulls Phaser in, loaded lazily) |
| `src/game/scenes/` | Phaser scenes |
| `src/game/cine/` | Cinematic script data types (`types.ts`, append-only) consumed by the CinematicScene runner |
| `src/game/cinematics/scripts/` | Cinematic scripts as data ported from legacy `scenes.js`: Homeworld: Pria and The Disturbance (captions verbatim) |
| `src/game/views/` | Arena renderer views: pooled `CharacterView` sprites and the pure `EntityViewPool`; the `Arena` scene (in `src/game/scenes/`) reads the core `RenderView` facade (`src/core/sim/view.ts`) and interpolates by the step driver's alpha; `?ff=arenaDemo` runs a bot-vs-bot match |
| `src/game/hud/` | Pure top-HUD geometry and data (`bars.ts`: legacy `topHUD.js` layout at 1280, health colour ramp; `buffs.ts`: buff slots; `action-bar.ts`: action bar slots, key labels, cooldown sweep, click-to-Command, fed by `RenderView.actionBar`); the parallel `Hud` scene (`src/game/scenes/Hud.ts`) draws them from the `RenderView` and never decides death (intentional divergence from legacy) |
| `src/game/fx/` | Cosmetic sim-event effects (`event-fx.ts`): damage flash, hit particles and shake, deduped by event id `(tick,sourceId,kind,seq)` in a bounded set, own cosmetic RNG, reduced-motion aware; pooled `ProjectileView` lives in `src/game/views/` |
| `src/game/audio/` | Sim-event audio (`audio-manager.ts`, `sound-map.ts`): music/sfx/ui gain buses, music ducking, CTRL-M mute via the input effect callback, context resume on first gesture, deduped by event id; ogg only |
| `src/game/input/` | Keyboard input: remappable bindings (`key-map.ts`, pure reducer) and `KeyboardAgent` mapping keys to the sim Command bitset; no gameplay logic |
| `src/game/loop/` | Fixed 50 Hz step driver (injected clock, 250 ms clamp, step cap, pause, render alpha) |
| `src/game/cinematics/` | Data-driven cinematics: pure `CinematicRunner` step sequencer (header, caption, sprite, tween, wait, waitKey, skip) and the ported intro script; drawn by the `Cinematic` scene (`?ff=cinematicDemo`), which removes all listeners on shutdown or game destroy |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle, settings), `styles/main.css` |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle; info screens wiki, key-bindings, about, race), `styles/main.css` |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle; `main-menu.ts` is the main menu), `styles/main.css` |
| `src/testing/` | Test-only helpers; `src/testing/legacy/` holds the Crafty/jQuery/DOM stubs, fake clock and seeded random used to run the frozen legacy sources in `node:vm` |
| `tests/` | Cross-cutting tests (`tests/repo/`), Playwright e2e (`tests/e2e/`); unit tests are colocated in `src/` |

## Where do I put X

| Thing | Location today |
|---|---|
| A new decision record | `docs/adr/NNNN-<slug>.md`, and add it to `docs/adr/README.md` |
| Notes about legacy code or bugs | `docs/legacy/` |
| General documentation | `docs/` |
| Anything touching the running legacy game | `war/WEB-INF/private/src/`, but the legacy game is frozen as the parity oracle, so prefer not to edit it |
