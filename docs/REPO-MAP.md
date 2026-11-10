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
| `tools/` | TypeScript build tooling: `tools/assets/` (asset manifest and copy), `tools/gen/` (generated tables, LUTs, golden replays), `tools/sim/` (match CLI), `tools/replay-verify.ts` (`pnpm replay:verify`) |
| `tools/gen/` | Node generators for `src/core` tables: `gen-luts.ts` writes `src/core/math/lut.generated.ts` (run with `pnpm exec tsx`); `gen-design-tables.ts` fills the generated tables in `docs/GAME-DESIGN.md` (`pnpm docs:gen`) |
| `tools/assets/` | `extract-legacy-manifest.ts` vm-loads the legacy asset manifests and writes `src/game/assets/manifest.generated.json` (run with `pnpm exec tsx`); `build-assets.ts` (`pnpm assets:build`) copies the manifest's images and sounds plus the favicon into `public/`, verifying sha256 |
| `tools/sim/` | `run-match.ts` (`pnpm sim:match`): headless AI-vs-AI matches, seeds, per-match metrics, round-robin tournament and element matrix; see [BALANCE.md](BALANCE.md). `fun-metrics.ts` (pure reducer of sim events into the fun metrics) and `fun-report.ts` (`pnpm fun:report`): see [FUN-DESIGN.md](FUN-DESIGN.md) section 4. `run-net.ts` (`pnpm sim:net`): a bot-vs-bot match over the lockstep session and the fake network, printing stalls, resends and lag; see [NETCODE.md](NETCODE.md) |
| `public/` | Runtime assets copied from the legacy tree by `pnpm assets:build`: `public/assets/img/`, `public/assets/snd/` and `favicon.png` (generated, do not edit) |
| `docs/` | Documentation: `BRANCHING.md`, `TESTING.md` (test commands, layout, fixtures, guards), this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `docs/` | Documentation: [PERFORMANCE.md](PERFORMANCE.md) (budgets and how they are measured), `BRANCHING.md`, [ARCHITECTURE.md](ARCHITECTURE.md) (layers, tick pipeline, state), [DETERMINISM.md](DETERMINISM.md) (the sim determinism contract), this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `docs/` | Documentation: `BRANCHING.md`, `PARITY.md` (legacy parity checklist with test evidence), this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `.github/` | CI workflow (`workflows/ci.yml`), Dependabot config, the PR template and `.github/ISSUE_TEMPLATE/` |
| `docs/` | Documentation: `BRANCHING.md`, `DEPLOYMENT.md`, this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `.github/` | CI and Pages deploy workflow (`workflows/ci.yml`), Dependabot config, the PR template and `.github/ISSUE_TEMPLATE/` |
| `.github/workflows/` (security) | `codeql.yml`, `secrets.yml` (gitleaks, baseline in `.gitleaksignore`), `osv.yml` (audit, non-blocking), `sbom.yml` (CycloneDX artifact), plus the `coverage` job in `ci.yml`; see [SECURITY-GATES.md](SECURITY-GATES.md) |
| `tools/ci/` | `size-check.ts` + `size-budget.json` (`pnpm size:check`): gzip size budgets per chunk and a check that the menu does not load Phaser, see [PERFORMANCE.md](PERFORMANCE.md); `local-ci.ts` (`pnpm ci:local [--fast]`): runs the CI commands locally with a summary table; `deploy-pages.ts` (`pnpm deploy:pages [--dry-run]`): publishes the Pages build to the `gh-pages` branch without Actions; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| `tools/visual/` | `run.ts` (`pnpm visual:capture`, `visual:pacing`, `visual:regress`, `visual:update`): wrapper over `playwright.visual.config.ts`; specs live in `tests/visual/`, see [VISUAL-QA.md](VISUAL-QA.md) |
| `tools/sbom/` | `sbom.sh` (`pnpm sbom`): production-only CycloneDX SBOM to `out/sbom.cdx.json` |
| `docs/FUN-DESIGN.md` | Design (not built) of the opt-in Arcade ruleset behind the `rulesetArcade` sim flag: fun diagnosis, features in ticks, juice, fun metrics and the work-package plan, see [FUN-DESIGN.md](FUN-DESIGN.md) |
| `docs/adr/` | Architecture decision records, see the [ADR index](adr/README.md) |
| `docs/legacy/` | Legacy module inventory and known-bug table |
| `.claude/` | Claude Code project config: `settings.json`, `.claude/agents/` (reviewers, analysts), `.claude/skills/` (slash commands), `.claude/hooks/`, `.claude/workflows/full-review.js`; see [CLAUDE-SETUP.md](CLAUDE-SETUP.md), pinned by `tests/repo/claude-setup.test.ts` |
| `src/` | New TypeScript port (see below) |
| `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `playwright.pages.config.ts` | pnpm, TypeScript, Vite, Vitest and Playwright project config |
| `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `.gitignore` | Agent instructions, readme, contributing guide, ignore rules |

## New code (`src/` and `tests/`)

| Path | What it is |
|---|---|
| `src/core/` | Pure deterministic simulation code: no DOM, Phaser, Date or Math.random; public entries `index.ts` (full), `menu-index.ts` (menu-safe, no sim) and `lazy-index.ts` (dynamic import from the menu graph) |
| `src/core/sim/` | Typed-array (SoA) sim state with fixed capacities, snapshot/restore, snapshot ring, state hash, the lowest-id-first entity allocator and the game clock (`clock.ts`: `now`, `isArcade`, freeze gate) |
| `src/core/sim/` | Typed-array (SoA) sim state with fixed capacities, snapshot/restore and the lowest-id-first entity allocator |
| `src/core/sim/systems/` | Per-tick sim systems run by `step` in fixed order (movement, status so far) |
| `src/core/sim/systems/arcade/` | Arcade-only rules (`rulesetArcade`): `hit.ts`, the single Arcade hit path (hit strength, hit-stop, `hitConfirmed`); `stun.ts` (hit-stun, juggle and stun caps, `canAct`, invulnerability); `knockback.ts` (Q4 knockback, wall clamp and bounce); `combo.ts` (combo counter, damage scaling, counter hits, `comboEnded`); `meter.ts` (hyper meter gains and spending, `meterLevel`); `super.ts` (the `health` slot: `Cmd.super`, super freeze, invulnerability, the generic Elemental Burst, `superStarted`/`superEnded`); `aim.ts` (8-way aim: `castDir` for the cast sites); `input.ts` (the `input` slot: stun and combo expiry); `round.ts` (the `cleanup` slot: round phases, timer, KO slow motion, time over, best of 3, reset between rounds); `round-testkit.ts` (test support only: `skipIntro` puts a fresh Arcade world in round 1's fight) |
| `src/core/agents/` | `Agent` interface with a read-only `ObservationView` facade, seeded random bot (own `AgentRng` stream, outside `SimState`) and replay agent |
| `src/core/replay/` | Replay file format (header, RLE inputs, hash checkpoints every 50 ticks), recorder, verifying player and the bot-match helper behind the golden fixture in `tests/fixtures/replays/` |
| `src/core/agents/` | `Agent` interface with a read-only `ObservationView` facade, seeded random bot (own `ai.pN` stream) and replay agent |
| `src/core/replay/` | Replay file format (header, RLE inputs, hash checkpoints every 50 ticks), recorder, verifying player, `validate.ts` (pre-flight check of untrusted replay files) and the bot-match helper behind the golden fixture in `tests/fixtures/replays/` |
| `src/core/tester/` | Tester-mode state edits (`cheats.ts`: HP, win, freeze, capture-win, god mode, instant swap, bench rows) and save edits (`save-edits.ts`: levels, chapter, every race); applied outside `step`, never part of Classic play |
| `src/core/agents/scripted-ai/` | Ports of the legacy EnemyCharacter AI as agents (exported through `src/core/lazy-index.ts`, the core entry for lazy chunks, so the menu entry chunk stays small, together with the random bot and replay validate/format); `attack.ts` has attack direction, axis and range checks and the primary/secondary preconditions; `arcade.ts` (`ArcadeTactics`) is the Arcade-only layer at Normal: combo cap, stepping in during the opponent's stun, supers on confirm, diagonal shots (identity without `ObservationView.arcade`) |
| `src/core/net/` | Pure lockstep netcode groundwork: `Transport` interface, packet codec and `LockstepSession` (input delay, redundant acked inputs, stall, hash desync check, timeout and hidden-tab policy); no DOM, no Date. See [NETCODE.md](NETCODE.md) |
| `src/testing/net/` | Test tooling: seeded in-memory `FakeNetwork` (latency, jitter, loss, duplication, reordering), the two-session `runNetMatch` harness and the lockstep tests |
| `src/core/save/` | Save schema v1 (valibot), v0 to v1 migration, `migrate()` and `validate.ts` (known characters, ranges, sizes); format in [SAVE-FORMAT.md](SAVE-FORMAT.md) |
| `src/game/` | Phaser renderer and app glue (browser only); `src/game/app/` is the composition root |
| `src/game/app/` | Composition root: `main.ts` (start-up, router wiring), `flow.ts` (story flow: new game, garrison, battle, results, save), `replay-viewer.ts`; Arcade Versus (`#arcade`, its own lazy `arcade-versus` chunk) is `arcade-versus.ts` (picker, battle, results in one route; no save store) and `arcade-setup.ts` (pure: `MatchSetup` with `rulesetArcade`, the Arcade AI, the launch) |
| `src/game/platform/` | Leaf module for browser-platform glue (UI feature flags, test-only `window.__TTE__` hook); imports only core via its index |
| `src/game/platform/storage/` | Save persistence: `SaveStore`, `StorageAdapter` (localStorage / in-memory), raw v0 backup, export/import |
| `src/game/assets/` | Generated legacy asset manifest (`manifest.generated.json`), typed keys (`keys.ts`) and the pure `manifestToLoadList` (`load-list.ts`) used by the Preload scene |
| `src/game/platform/storage/` | Save persistence: `SaveStore`, `StorageAdapter` (localStorage / in-memory), IndexedDB store with localStorage mirror, raw v0 backup, export/import |
| `src/game/assets/` | Generated legacy asset manifest (`manifest.generated.json`) and typed keys (`keys.ts`) |
| `src/game/boot/` | Phaser boot: WebGL check, error screen and game config (`phaser-config.ts` is the only file that pulls Phaser in, loaded lazily) |
| `src/game/scenes/` | Phaser scenes |
| `src/game/cine/` | Cinematic script data types (`types.ts`, append-only) consumed by the CinematicScene runner |
| `src/game/cinematics/scripts/` | Cinematic scripts as data ported from legacy `scenes.js`: Homeworld: Pria, The Disturbance, Call of the Tamer and Restoring Balance (captions verbatim) |
| `src/game/views/` | Arena renderer views: pooled `CharacterView` sprites and the pure `EntityViewPool`; the `Arena` scene (in `src/game/scenes/`) reads the core `RenderView` facade (`src/core/sim/view.ts`) and interpolates by the step driver's alpha; `?ff=arenaDemo` runs a bot-vs-bot match (`?ff=arenaDemo,arcade` with the Arcade ruleset) |
| `src/game/hud/` | Pure top-HUD geometry and data (`bars.ts`: legacy `topHUD.js` layout at 1280, health colour ramp plus colour-blind-safe health cues and high-contrast palette; `buffs.ts`: buff slots with plus/cross glyphs; `action-bar.ts`: action bar slots, key labels, cooldown sweep, click-to-Command, fed by `RenderView.actionBar`; `arcade-hud.ts`: the Arcade damage numbers, combo counter and hyper meter model, fed by the Arena from `hitConfirmed` and `RenderView.arcade`); the parallel `Hud` scene (`src/game/scenes/Hud.ts`) draws them from the `RenderView` and never decides death (intentional divergence from legacy) |
| `src/game/fx/` | Cosmetic sim-event effects (`event-fx.ts`): hit flash (frame-counted in `CharacterView`), hit particles and shake; in Arcade, element-coloured sparks and shake by hit strength, hit-stop jitter and damage numbers from `hitConfirmed`/`hitStop`, and the super cinematic (`super-cinematic.ts` pure frame plan, `super-view.ts` Phaser view loaded on the first super as its own chunk), and the 8-way aim arrow (`aim-view.ts`, in the `arcade-versus` chunk through the launch's `arcadeView` hook); deduped by event id `(tick,sourceId,kind,seq)` in a bounded set, own cosmetic RNG, reduced-motion aware (`motion.ts`: pure tween plan and shake rules also used by the cinematics); pooled `ProjectileView` lives in `src/game/views/` |
| `src/game/audio/` | Sim-event audio (`audio-manager.ts`, `sound-map.ts`): music/sfx/ui gain buses, music ducking, CTRL-M mute via the input effect callback, context resume on first gesture, deduped by event id; `arena-audio.ts` wires it into the Arena from Phaser's decoded sounds and persists the mute choice; ogg only |
| `src/game/input/` | Keyboard input: remappable bindings (`key-map.ts`, pure reducer) and `KeyboardAgent` mapping keys to the sim Command bitset; no gameplay logic |
| `src/game/replay/` | Playtest recording outside core: `PlaytestRecorder` (hashes the live world just before each step; agents never write `SimState`, so it equals the replayed world) and `ReplayCursor` (tick-by-tick playback that checks every recorded hash); the app glue is `src/game/app/replay-viewer.ts` (route `#replay`) and `download.ts`, the local store is `src/game/platform/storage/replay-store.ts` (IndexedDB `tte-replays`, last 5) |
| `src/game/input/` | Keyboard and gamepad input: `key-map.ts` (pure reducer over the remappable bindings), `gamepad.ts` (pure Gamepad API mapping to the same Command bits; `ARCADE_PAD` puts the super on RT) and `KeyboardAgent` mapping both to the sim Command bitset (the super only in Arcade); no gameplay logic |
| `src/game/a11y/` | In-battle accessibility: `announcer.ts` (event to screen-reader line mapping, throttle, low-health watch, hidden live regions) and `pause-dialog.ts` (focus-trapped modal pause dialog); see [ACCESSIBILITY.md](ACCESSIBILITY.md) |
| `src/game/platform/` (settings) | `record-setting.ts` (Record playtests, local only) and `arcade-setting.ts` (`arcadeEnabled`: the settings save's `arcadePreview` opt-in, or `?ff=arcade` in dev and test builds) |
| `src/game/platform/a11y/` | Pure accessibility preferences: reduce motion and high contrast resolved from the save and the OS (`prefs.ts`) |
| `src/game/platform/input/` | Pure key-binding model: defaults, conflict detection, reset and save (de)serialisation (`bindings.ts`) |
| `src/game/platform/tester/` | Tester mode session (`session.ts`): opt-in per tab, throwaway save slot, `TesterAwareStore`; see [TESTER-MODE.md](TESTER-MODE.md) |
| `src/game/loop/` | Fixed 50 Hz step driver (injected clock, 250 ms clamp, step cap, pause, render alpha) |
| `src/game/cinematics/` | Data-driven cinematics: pure `CinematicRunner` step sequencer (header, caption, sprite, tween, wait, waitKey, skip) and the ported intro script; drawn by the `Cinematic` scene (`?ff=cinematicDemo`), which removes all listeners on shutdown or game destroy |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle, settings), `styles/main.css` |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle; info screens wiki, key-bindings, about, race), `styles/main.css` |
| `src/ui/` | DOM menus in vanilla TS: `router.ts` (allow-list hash router), `dom.ts`, `src/ui/screens/` (screen lifecycle; `main-menu.ts` is the main menu), `keyboard.ts` (Escape back, Space on links, focus on navigation), `styles/main.css` |
| `src/ui/screens/` | One module per DOM screen; `arcade-versus.ts` is the Arcade Versus picker and results DOM (lazy, loaded with the Arcade flow) |
| `src/ui/tester/` | Tester mode DOM: badge, tester panel, bench health panel, cheat-code matcher and installer |
| `src/testing/` | Test-only helpers; `src/testing/legacy/` holds the Crafty/jQuery/DOM stubs, fake clock and seeded random used to run the frozen legacy sources in `node:vm` |
| `tests/` | Cross-cutting tests (`tests/repo/`, `tests/lint/`), legacy characterization (`tests/legacy/`), browser determinism (`tests/browser/`), Playwright e2e (`tests/e2e/`), fixtures (`tests/fixtures/`); unit tests are colocated in `src/`. See [TESTING.md](TESTING.md) |
| `tests/` | Cross-cutting tests (`tests/repo/`), Playwright e2e (`tests/e2e/`), Pages-subpath smoke (`tests/e2e-pages/`, `pnpm e2e:pages`); unit tests are colocated in `src/` |

## Where do I put X

| Thing | Location today |
|---|---|
| A new decision record | `docs/adr/NNNN-<slug>.md`, and add it to `docs/adr/README.md` |
| Notes about legacy code or bugs | `docs/legacy/` |
| General documentation | `docs/` |
| Anything touching the running legacy game | `war/WEB-INF/private/src/`, but the legacy game is frozen as the parity oracle, so prefer not to edit it |
