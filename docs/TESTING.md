# Testing

How to run, place and write tests. Run everything with `corepack pnpm <script>` (or plain `pnpm` if corepack is enabled).

## Commands

| Command | What it runs |
|---|---|
| `pnpm test` | Vitest projects `core` and `repo` (node): unit tests in `src/**/*.test.ts`, plus `tests/repo/` and `tests/lint/` |
| `pnpm test:legacy` | Vitest project `legacy`: `tests/legacy/**`, integrity of the recorded legacy fixtures (no legacy code runs) |
| `pnpm oracle:restore` | Opt-in: extract the legacy game from git tag `legacy-crafty-1.0` into the gitignored `.oracle` directory (never `user.properties`) |
| `pnpm test:oracle` | Vitest project `oracle`: `tests/oracle/**` characterization tests that run the restored legacy code in `node:vm`; without `.oracle` one skipped placeholder prints how to restore it |
| `pnpm test:browser` | Vitest project `browser`: `tests/browser/**/*.browser.test.ts` in headless Chromium, Firefox and WebKit |
| `pnpm e2e` | Playwright (`playwright.config.ts`): `tests/e2e/*.spec.ts` against `vite build --mode test` (written to the per-checkout `tte-e2e-build` directory inside the git dir, never `dist/`) served by `vite preview` through `tools/ci/e2e-server.ts` on the checkout's own port (`tools/ci/e2e-port.ts`; `E2E_PORT=n` picks another port for parallel worktrees) |
| `pnpm visual:capture`, `visual:pacing`, `visual:regress`, `visual:update` | Visual QA (`playwright.visual.config.ts`, `tests/visual/`): screenshots, videos, frame pacing and screenshot regression; `ci:local --visual` adds them. See [VISUAL-QA.md](VISUAL-QA.md) |
| `pnpm golden:record` | `tools/gen/record-golden.ts`: rewrites the bot-vs-bot goldens in `tests/fixtures/replays/`; `--ruleset arcade` writes only the Arcade goldens (`arcade-1v1.replay.json`: scripted AI; `arcade-moves`, `arcade-weather` and the 2v2 `arcade-tag`: hand-scripted inputs from `tools/gen/arcade-moves.ts`) and leaves the Classic goldens alone |
| `pnpm fun:gates` | `tools/ci/fun-gates.ts`: the nightly fun gates. Plays Arcade (AI level 3, all 66 pairings, `--seeds 8`, `--team-sizes 1,2`) headlessly, judges round length, time-over rate, stalemate (stall) rate, first-hit time, combo median/p90, hits per minute, comeback rate, multi-hit combo share and the per-race win-rate spread (worst/best race) against the inclusive bands in the committed `tools/ci/fun-gates.json`, plus a latency mark (wall ms per sim second); writes `out/fun-gates.json`, exits 1 on a miss (`--no-fail` to only report). Manual dispatch only (`.github/workflows/nightly-fun-gates.yml`, schedule removed 2026-11-17 to save Actions minutes); run `pnpm fun:gates` locally; not in PR CI. Move a band only on purpose, with `pnpm fun:noise` numbers in the commit. Metric maths: `tests/repo/fun-gates.test.ts` |
| `pnpm fun:noise` | `tools/ci/fun-noise.ts`: one (team size, AI level) configuration (`--team-size`, `--ai-level`) played in several seed blocks (`--blocks 4 --block-size 8`, all pairings); prints per metric the block min / mean / max against the tight fun-gate bands, to size the noise before moving a band. Headless, minutes per configuration; run the four of 1v1/2v2 x AI level 2/3 in parallel |
| `pnpm range:probe` | `tools/sim/range-probe.ts`: Arcade 1v1, every pairing, scripted AI (`--seeds 4`, `--ai-level 3`); prints each hero's kit (melee box, projectile speed and travel time) and hits landed by centre-to-centre distance bucket (melee / ranged / other); writes `out/range-probe.json`. Read-only, never touches `src/core` |
| `pnpm ability:usage` | `tools/sim/ability-usage.ts`: ability usage metrics. Plays every 1v1 pairing with the scripted AI (`--ruleset arcade\|classic`, `--seeds 4`, `--ai-level 3`) and reports per hero and ability slot: casts (a rise of the slot's cooldown deadline in `SimState.abil`, so buffs, heals and omni fans count), casts per fighter-minute, uptime (active count above zero, or the buff's status on the hero), hits, damage and hits per cast (Arcade `hitConfirmed` only; Classic reports casts and uptime), and the slot's share of the hero's casts. Verdicts: dead (under 0.3 casts/min), rare (under 2), overused (over 85% of the hero's casts), else ok; lists dead and overused abilities and writes `out/ability-usage.json`. Dash, Parry, Weather and Charge are not ability slots and are not measured here (they have their own events: `dashed`, `parried`, `weatherChanged`, `chargeStarted`). Read-only, never touches `src/core`. Maths: `tests/repo/ability-usage.test.ts` |
| `pnpm ability:gates` | `tools/ci/ability-usage-gates.ts`: the nightly ability-usage gate. Runs the `ability:usage` Arcade measurement (`--seeds 8`) and exits 1 when a slot is dead (under `deadBelowCastsPerMinute`) or a hero's top slot passes its `maxTopShare` band in the committed `tools/ci/ability-usage-gates.json`; writes `out/ability-usage-gates.json` (`--no-fail` to only report). Runs in `.github/workflows/nightly-fun-gates.yml`; not in PR CI. Move a band only on purpose, with `ability:usage` numbers in the commit. Maths: `tests/repo/ability-usage-gates.test.ts` |
| `corepack pnpm exec tsx tools/sim/super-timing.ts` | Super timing probe (qa-r27): every race's super pressed with one bar at an idle foe on the same row (`--victim all\|<race>`, `--gaps 0,200` px clear of the caster's edge, `--json`); prints per caster the frame of the first damage (steps after the press, freezes and hit-stops included), the damage dealt by frames 20/30/60/90 and the total, as % of the foe's max HP (`--level` sets the heroes' level, default 1). Targets: first damage within 20 frames, about 25-35% when every hit lands. The in-core twin is `src/core/sim/systems/arcade/super-timing.test.ts`. Read-only |
| `pnpm fun:report` | `tools/sim/fun-report.ts`: plays AI-vs-AI matches (`--ruleset arcade`, `--team-size 1\|2`, `--all` for 66 pairings) and prints the [FUN-DESIGN.md](FUN-DESIGN.md) section 4 metrics from `tools/sim/fun-metrics.ts`; writes `out/fun-report.json` |
| `pnpm replay:verify <file...>` | `tools/replay-verify.ts`: re-simulates replay files headlessly; exits 1 on a hash mismatch |
| `pnpm docs:gen` | `tools/gen/gen-design-tables.ts`: refreshes the generated tables in `docs/GAME-DESIGN.md` |
| `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm build` | ESLint (including the `src/core` determinism bans), `tsc -b`, dependency rules, typecheck plus Vite build |

Pre-merge set (the local gate is the per-commit check; GitHub Actions runs only once a day, see [DEPLOYMENT.md](DEPLOYMENT.md), and runs `test:coverage` (which includes the `dom` project that `pnpm test` skips) and `test:browser` but NOT e2e):
`pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test && pnpm exec vitest run --project dom && pnpm test:legacy && pnpm build && pnpm e2e`.
Run `pnpm e2e` (and `pnpm e2e:pages` when the base path or build changed) before pushing (it routes to the GPU PC by default, see "Routing e2e to the PC"); it is no longer a CI job.

`pnpm size:check` (after `build`) enforces bundle budgets; see [PERFORMANCE.md](PERFORMANCE.md).

`pnpm ci:local` runs all of the above plus `e2e`, `e2e:pages` and `test:browser` per launchable engine and prints a summary
table (`--fast` skips browsers); use it instead of waiting for Actions. See [DEPLOYMENT.md](DEPLOYMENT.md).

Browser engines for `test:browser` and `e2e` need `pnpm exec playwright install chromium firefox webkit` once (e2e uses chromium only).

### Property tests

`src/core/sim/sim.property.test.ts` uses fast-check. Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `SIM_FUZZ_RUNS` | 25 | Property runs per test (raise for a nightly-style soak) |
| `SIM_FUZZ_TICKS` | 300 | Maximum ticks per run |
| `FC_SEED` | `0x7a11` (31249) | fast-check seed; pinned so failures reproduce. Use the seed printed by a failure |

Example: `SIM_FUZZ_RUNS=500 SIM_FUZZ_TICKS=1500 pnpm test`. Single file: `pnpm exec vitest run --project core src/core/sim/sim.property.test.ts`.

## Where each kind of test lives

| Kind | Location |
|---|---|
| Unit tests for `src/core`, `src/game`, `src/ui` | Colocated next to the code: `src/**/<name>.test.ts` |
| Data tables vs legacy | `src/core/data/*.test.ts` (compare against `tests/fixtures/legacy/*.json`) |
| Determinism, snapshot, replay | `src/core/sim/*.test.ts`, `src/core/replay/replay.test.ts` |
| Characterization of legacy behaviour (oracle-only) | `tests/oracle/*.characterization.test.ts`, fixtures in `tests/fixtures/legacy/`; fixture integrity in `tests/legacy/fixtures.test.ts` |
| Known legacy bugs (oracle-only) | `tests/oracle/known-bugs.characterization.test.ts` (tagged `// KNOWN-BUG:<slug>`, see `docs/legacy/KNOWN-BUGS.md`) |
| Repo and docs guards | `tests/repo/*.test.ts` |
| ESLint ban checks | `tests/lint/core-bans.test.ts` with samples in `tests/lint/fixtures/` |
| Cross-engine determinism | `tests/browser/determinism.browser.test.ts` |
| End to end (real browser, real build) | `tests/e2e/*.spec.ts` |
| Accessibility (axe audit, keyboard-only, reduce motion, rebinding, gamepad, announcements) | `tests/e2e/a11y.spec.ts`, `keyboard.spec.ts`, `a11y-features.spec.ts`; see [ACCESSIBILITY.md](ACCESSIBILITY.md) |
| Hit feedback (fake sinks: 100% feedback coverage over real Arcade matches, reduced motion; the V6 flash in the browser) | `src/game/fx/event-fx.test.ts`, `src/game/views/character-view.test.ts`, `src/game/hud/arcade-hud.test.ts`, `tests/e2e/arcade-juice.spec.ts`, `tests/e2e/manual-fx-age.spec.ts`, `src/game/hud/combo-anchor.test.ts`, `tests/e2e/combo-anchor.spec.ts` (anchored combo counter; long gate) |
| Arcade Versus (setup builder, Arcade AI levels, recorded flag, no storage access; no save store in its modules; 2v2: team-size and partner parsing, the AI's seeded partner, the per-hero AI, every hero's end state; e2e: on the menu by default, hit, super from X and the touch button, KO, results, rematch, save untouched, 390x844 picker; the 2v2 picker, tag on 3 and the touch Tag button, KO entrance, 2v2 results) | `src/game/app/arcade-setup.test.ts`, `tests/repo/arcade-no-save-writes.test.ts`, `tests/e2e/arcade.spec.ts`, `tests/e2e/arcade-tag.spec.ts`; the production path (`?ff=` ignored, on by default, lazy chunk under the Pages subpath) in `tests/e2e-pages/pages-arcade.spec.ts` |
| Online quick match through the relay (the spec builds its own bundle; no @smoke online spec; `?ff=netbot`, `?netsim=` and `__TTE__.net()` are dev/test only; `LockstepSession.checkpoints()` unit test) | `src/testing/net/checkpoints.test.ts`, `tests/e2e/online-quick.spec.ts` |
| Tester mode (cheat core, session and save slot, UI pieces, e2e) | `src/core/tester/tester.test.ts`, `src/game/platform/tester/session.test.ts`, `src/ui/tester/tester-ui.test.ts`, `tests/e2e/tester-mode.spec.ts`; see [TESTER-MODE.md](TESTER-MODE.md) |
| Legacy loader stubs (Crafty, jQuery, DOM, clock, seeded random) | `src/testing/legacy/` |
| Golden replay | `tests/fixtures/replays/*.replay.json` (random-vs-random, random-2v2-ch3 and the arcade-* replays) |

## Characterization fixtures

`tests/fixtures/legacy/*.json` and `tests/fixtures/legacy/saves/` record what the legacy code does (the frozen parity
evidence; the code itself is retired, see [legacy/ARCHIVE.md](legacy/ARCHIVE.md)). The `tests/oracle` tests compare the restored legacy code against them, and port tests (for example `src/core/data/abilities-a.test.ts`) read them as the oracle.

Regenerate with `pnpm oracle:restore` then `TTE_UPDATE_FIXTURES=1 pnpm test:oracle` (the tests rewrite the files they cover instead of only comparing).

When this is allowed:

- Only when the legacy test harness or stubs changed, or a fixture is new. The legacy code is frozen (git tag `legacy-crafty-1.0`), so a changed fixture
  without a harness change means the characterization is wrong or something unintended moved.
- Review the full `git diff tests/fixtures/` and explain it in the commit message. Never regenerate just to turn a red test green.
- Never regenerate to bless a port divergence. Port parity bugs are reproduced, with the correct behaviour written as `it.fails(...)`
  tagged `// KNOWN-BUG:<slug>`; only a `fix-*` work package flips them.

The golden replay is separate: run `pnpm golden:record` only when a simulation change is intended. Bump `SIM_VERSION`
(`src/core/version.ts`) in the same change, review the hash diff, and say why in the commit message. The browser gate then checks
that Chromium, Firefox and WebKit reproduce the committed hashes.

## Guard tests (`tests/repo/`, `tests/lint/`)

- `tests/repo/repo-map.test.ts`: every top-level directory tracked by git and every `src/*` directory must appear in
  `docs/REPO-MAP.md` as `` `dir/ `` text, and every backticked directory in that file must exist. Adding a directory means
  updating the map in the same change.
- `tests/repo/no-team-block-alias.test.ts`: `SimState.team` is per entity, `SimState.teams` is the per-team block. The test
  fails when a `.team[...]` index looks like a per-team block offset (`TEAM_`, `TeamField`, `STRIDE`, `idx`, `*` ...). Use `.teams[...]`.
- `tests/repo/classic-hash-pins.test.ts`: every Classic golden in `tests/fixtures/replays/` (flags without `rulesetArcade`)
  keeps a pinned `hashes` list and `finalHash`, so an Arcade `SIM_VERSION` bump (a header-only golden diff) cannot hide a
  Classic hash change ([FUN-DESIGN.md](FUN-DESIGN.md) section 6). A new Classic fixture needs a pin in the same change.
- `tests/repo/arcade-moves-coverage.test.ts`: coverage by events for the scripted Arcade goldens `arcade-moves.replay.json`,
  `arcade-weather.replay.json` and `arcade-tag.replay.json` (inputs authored with `tools/gen/arcade-script.ts` as named steps with durations, no AI; since WP 35 the weather needs a full charge, so `arcade-moves` has p2 fire 35 blasts off the right wall before its weather and `arcade-weather` walks laps to charge each cast; since WP 31 the seeds of `arcade-moves` and `arcade-tag` are picked so the first stage is not earth, so a rock does not break their timings, and `arcade-weather` ends with a second sandstorm so a rock stops shots and an earth hero walks over one). It
  replays them and asserts each mechanic fired at least once: a buffered cast (a cast on a tick whose button was already
  released), a 3+ hit combo with scaled damage, a counter hit, a dash with a perfect dodge, a charge that arrives, a guard with chip, a guard break,
  a parry that reflects a projectile, a diagonal (8-way) shot that lands, a meter-built super with its 40-tick freeze and a KO
  by the super's last hit, all five weathers (and a hit under one), a clash that
  destroys both and one won by element whose projectile then lands, and best of three (a KO, a time over, a super KO, then
  `matchEnded` 2-1), and the 2v2 tag team (a manual tag whose entrance attack is hit 2 of a combo, a KO entrance, a
  round that ends only when both heroes of a side are down, a benched hero healing). It also checks that the committed files equal what the scripts record today. When a sim change moves a
  hit by a few ticks, this fails by mechanic name; re-tune the offset in the script (trace the events), then
  `pnpm golden:record --ruleset arcade`. When a data change moves how much a hit takes off (WP-arcade-numbers), re-tune the
  `BEAT_ROUND_*` cone counts and the `GUARD_*` hold and blast counts at the top of `movesScript` instead. The files also run in the Node verification above and in the cross-browser list.
- `tests/repo/fun-metrics.test.ts`: the fun-metrics reducer on synthetic events, and the `run-match` `--ruleset/--team-size/--ai-level` options (Classic results unchanged).
- `tests/repo/fun-gate.test.ts`: REPORT-ONLY Arcade sample (`fun:report` numbers, per-race win rates and the WP-arcade-numbers bands marked `ok` or `OUT` are printed); it asserts only that the run is deterministic, super and combo coverage and that the bands are computed, never metric values.
- `tests/repo/balance-gate.test.ts` also checks the Arcade baseline `tests/fixtures/balance/arcade-baseline.json` (every race, `ARCADE_PARAMS`) and that the Classic parameters stay as they are. `pnpm balance:compare --ruleset arcade` diffs it nightly, report only ([BALANCE.md](BALANCE.md) "Arcade numbers"). The 2v2 baseline `tests/fixtures/balance/arcade-2v2-baseline.json` (`--ruleset arcade --team-size 2`, 8 seeds) is checked the same way, and `tests/repo/fun-gate.test.ts` plays a 2v2 sample, report only.
- `src/core/sim/arcade-numbers.test.ts`: the Arcade numbers table invariants: one row per playable race, integer per mille inside bounds, Classic max health unchanged while Arcade floors `hpPm` of it, and the cooldown overrides (Classic always gets the legacy cooldown).
- `tests/repo/docs-tables.test.ts`: the generated tables in `docs/GAME-DESIGN.md` must equal the output of `pnpm docs:gen`.
- `tests/repo/links.test.ts`: every relative markdown link in `README.md`, `CONTRIBUTING.md` and `docs/*.md` must resolve.
- `tests/repo/assets-manifest.test.ts`, `tests/repo/cine-scripts-a.test.ts`: asset manifest and ported cinematic data checks (their checks against the legacy text or manifest generator run only when `.oracle` exists).
- `tests/lint/core-bans.test.ts`: lints sample files to prove the `src/core` bans (`Date`, `Math.random`, transcendental `Math`,
  DOM globals and so on) are enforced.

## Turning a playtest into a regression test

1. Record: play with `?ff=record` (dev and test builds) or tick **Record playtests** in Settings (default off; nothing is
   recorded or stored without it, no telemetry, local only). Every tick's final command pair goes into a replay in the existing
   format (seed, rosters, flags, `simVersion`, RLE inputs, hash checkpoints every 50 ticks). Only a match that reaches its end counts.
2. Save: on the results screen press **Download replay** (a `.replay.json` file). The last 5 are also kept in IndexedDB
   (`tte-replays`) and listed in the viewer.
3. Check by eye: open `#replay` (Settings has a link), choose the file and watch it at 1x/2x, pause or single-step; the status
   line shows `OK` or `DIVERGED at tick N` for the first bad checkpoint.
4. Promote: copy the file to `tests/fixtures/replays/<name>.replay.json` and run `pnpm replay:verify tests/fixtures/replays/<name>.replay.json`.
   `tests/repo/replay-fixtures.test.ts` then verifies it (and every other fixture) in `pnpm test`.
5. A replay is tied to its `simVersion`. After an intended sim change, bump `SIM_VERSION`, re-record the goldens
   (`pnpm golden:record`) and re-record or retire playtest fixtures; never edit hashes by hand.

Cheat probes (`setHp`, `place`) change the live world outside the command stream, so a recording that used them is discarded.

## The `__TTE__` hook

`window.__TTE__` is a test-only object installed by `src/game/platform/test-hook.ts`. It exists only in dev and in
`vite build --mode test` (what Playwright builds); production builds drop it. It exposes `ready`, `version`, `scene`,
`state()` (route, scene, tick, paused), `hash()` (sim state hash), `step(n)` (pause and step the arena n ticks; the `arena` probe also has `stepLive(n)`, which lets the real keyboard decide the commands), `loadSave(json)`,
`listeners()` (live window/document listener count, 0 after leaving a battle), `settled()` (resolves after game teardown),
and `arena` / `cinematic` probes while those scenes run.

Typical e2e pattern (see `tests/e2e/app-flow.spec.ts`): `page.waitForFunction("window.__TTE__ && window.__TTE__.ready === true")`,
then drive it with `page.evaluate`. Arena demos start with the `?ff=arenaDemo` flag, cinematics with `?ff=cinematicDemo`. `?hero=<slug>&foe=<slug>` (dev and test builds) opens the real Versus arena (hero-element stage, normal HUD) with the chosen heroes, so a check can start as any hero (`tests/e2e/versus-hero-pick.spec.ts`); `?p1=<slug>` still works for the first hero.
Do not add game logic that reads the hook.

`state().route` is `location.hash`, which changes synchronously on click, before the router mounts the new screen on the
later `hashchange` task. `state().mountedRoute` is set by the router (test builds only) after the screen's `mount()` ran, and
`waitForRoute` waits on it, so keys pressed right after it hit the new screen. Screens with async content (Settings and other
save-backed screens show "Loading...") still need their own wait (`loaded()` in `tests/e2e/keyboard.spec.ts`).

### Driving the arena in a spec

- Wait with the shared `ARENA_READY` (`tests/e2e/parity/helpers.ts`), never a local copy: it also requires `arena.viewsReady()`. The Arcade
  views (round, weather, tag, defence) are lazy chunks that mount after the probe exists; a sim event emitted before they mount is not
  drawn (a "TAG!" call, a banner, a flash), and the probe then returns a state with no call. On a slow renderer (CI SwiftShader) the
  race shows up; locally it hides. Throttle to check: CDP `Emulation.setCPUThrottlingRate` rate 6 in a scratch copy of the spec.
- Drive ticks only with the probe: `step(n)` / `stepLive(n)` pause the live driver first, so no real-time tick lands between
  evaluates. Do not rely on wall-clock progress.
- Effects and manual stepping: while the driver is paused (`manual=1`, `step(n)`, `stepLive(n)`), frame-timed view effects hold their frame (hit flash, HUD damage numbers, white damage pops, hit rings, sparks, streaks, KO wash). A probe read or capture right after a step still shows what that step spawned, and further steps do not age them. Tick-driven views (defence call-outs, the super cinematic, idle auras) move with each step. To see effects age and expire, call `arena.ageFx(true)` and wait on a probe (`expect.poll(() => shockFx().pops)`), never on wall-clock time; `ageFx(false)` holds them again. `shockSeek(ms)` puts the shock layer's wash, rings, gold numbers and pops at `ms` for a repeatable mid-life frame.
- Known limitation (product): in a real match the first ticks are the 70-tick intro, so a view mounting a few frames late never
  misses a visible event; mounted views do not replay events from before their mount.

### Keeping e2e stable and finding flakes

- **Config** (`playwright.config.ts`, `playwright.pages.config.ts`): `expect` timeout 10 s, `actionTimeout` 30 s (main config) (an unclickable element
  fails fast with a call log instead of eating the 60 s test timeout), `retries: 1` and `trace: 'on-first-retry'` only when `CI` is set.
  Locally retries stay 0, except the router's PC short lane, which sets `TTE_E2E_RETRIES=1`. A pass-after-retry is reported as "flaky" by Playwright: treat it as a bug, not as green.
  `E2E_PORT` (main) and `E2E_PAGES_PORT` / `E2E_PORT` (pages, default 4174) let worktrees run side by side.
  Parallel e2e or QA runs (several agents, several worktrees) must each set their own `E2E_PORT`, or they collide on the same preview server; QA runs use the range 7900-7999.
- **Boot readiness**: main suite `waitForReady` / `gotoReady(page, url)` (`tests/e2e/parity/helpers.ts`) = `__TTE__.ready`; then `waitForRoute`
  (`mountedRoute`) after navigation and `ARENA_READY` for battles. Pages suite (production build, no hook): `gotoMenu` in
  `tests/e2e-pages/helpers.ts` waits for the first menu button to be visible and enabled.
- **Never** `waitForTimeout` in `tests/e2e*` (teardown: `__TTE__.settled()`; async saves: wait for `#main`; Settings/other save-backed
  screens: wait for their own content). Assert on what the player sees; do not click a selector the menu does not have. The menu is
  Play, Versus, Online, Settings, Help; About, Wiki, Key Bindings and Story live on Help (`li[data-route=...] a`).
- **E2E waits and failure capture.** Import `test` and `expect` from `tests/e2e/support/test.ts`. On a failed or timed-out test it attaches `console.txt` (console messages and page errors) and `tte-state.json` (`__TTE__` route, scene and tick) to the report. Specs with a second page call `captureConsole(page, testInfo, name)`. Wait for page state with `waitFor(page, 'what', predicate, {timeout?})` or `waitForArena(page)` from `tests/e2e/support/wait.ts`, so a timeout names what was awaited and the app state. Always pass `{ message }` to `expect.poll`. Never use `waitForTimeout` (1 documented absence check, in `first-run-hint.spec.ts`, is grandfathered). `tests/repo/e2e-raw-waits.test.ts` ratchets raw `waitForFunction`, `waitForTimeout` and unlabelled `expect.poll` against `tests/repo/fixtures/e2e-raw-waits.json`: counts may only go down, and an `expect` floor stops a migration from dropping an assertion. After migrating a spec, lower its counts in the JSON.
- **Preview server health** (`tools/ci/e2e-server.ts`, policy in `tools/ci/e2e-server-policy.ts`): the `webServer` of the main and pages configs is a supervisor,
  not a bare `vite preview`. It runs vite directly (no pnpm in between), so a signal reaches vite itself; Playwright stops it with
  SIGTERM (`gracefulShutdown`), and it also stops (`stop: parent gone`) when its stdin closes, so a killed runner leaves no orphan. Each
  checkout builds into its own `<git-dir>/tte-e2e-build` (worktrees used to share one directory and wipe each other's build). An unexpected
  exit is logged with uptime, plain-words cause (143 = SIGTERM from outside, `SIGKILL` = OOM or kill -9), the class of vite's stderr
  (`port in use`, `file vanished (ENOENT)`, `too many open files`), and for a taken port the process that holds it (an ORPHAN has ppid 1).
  It restarts with backoff (250 ms doubling to 15 s), and gives up (`gave up:`, exit 1) after 20 fast failures or 50 restarts. A probe
  every 5 s kills a preview that accepts connections but never answers (4 refusals or timeouts in a row and 60 s since the last good
  answer; ticks late because the machine was starved do not count); a non-2xx answer is logged once and never kills.
  The log is `.scratch/e2e-server.log` in the checkout on the Mac (`TTE_E2E_SERVER_LOG` overrides; rotated to `.1` over 2 MB), and
  `e2e-server.log` in the results directory on the PC (fetched to `.scratch/remote-e2e/<id>/`). A healthy run starts with `start:`,
  then `build ok`, `preview started`, and ends with `stop: SIGTERM`. After a failed run the router prints the run's trouble lines
  (`preview server trouble during this run:`). To stop a run's server, signal its supervisor; never `pkill -f vite` (it also kills
  other worktrees' servers). Caveats: a test that runs inside a restart window (about 100 ms to a few seconds) still fails; and
  `TTE_BROWSER_SLOT_HELD=1` bypasses the slot, so it loses the one-build-per-checkout guarantee. The itch suite (`e2e:itch`) has no server.
- **Finding flakes**: `E2E_PORT=4841 pnpm e2e:flake --repeat 5 tests/e2e/tour.spec.ts tests/e2e/arcade-` (`tools/ci/e2e-flake.ts`) runs the
  specs with `--repeat-each`, retries off, and prints pass counts per test (exit 1 if any test failed once). Extra args pass through
  to Playwright, e.g. `--config playwright.pages.config.ts`. Check a suspect on a slow machine with CDP CPU throttling (see above).

## Writing a new ability or character test

Abilities and characters are data in `src/core/data/` (`abilities-a.ts`, `abilities-b.ts`, `characters.ts`). Follow the pattern
in `src/core/data/abilities-a.test.ts` and `characters.test.ts`:

1. Add the data entry, then a colocated test that compares each field with the legacy fixtures
   (`tests/fixtures/legacy/data.json`, `abilities-range.json`, `abilities-effects.json`) imported from `tests/fixtures/legacy/`.
   Port the legacy numbers (ticks = ms / 20); do not hand-copy values into the test.
2. For sim behaviour, add a test beside `src/core/sim/step.test.ts` or `match.test.ts`: build a sim from a fixed seed, apply the
   ability through the Command bitset, step N ticks, and assert on events and state, not on rendering.
3. Assert determinism: the same seed and inputs give the same state hash, and snapshot then restore continues identically
   (`snapshot.test.ts` shows the round trip).
4. If the legacy behaviour is what you are matching and it is buggy, assert the buggy value and add the correct-behaviour
   case as `it.fails(...)` with `// KNOWN-BUG:<slug>`.
5. A gameplay-affecting data change moves the golden replay: bump `SIM_VERSION`, run `pnpm golden:record`, review the diff.
6. Run `pnpm test` and `pnpm test:legacy` (and `pnpm test:oracle` after `pnpm oracle:restore` when oracle-only parity evidence is involved); then the full pre-merge set above.

`src/core` tests obey the same bans as the code: no `Date`, `Math.random` or transcendental `Math`; randomness comes from the
seeded streams in `src/core/rng/`.

## Testing tester mode

Tester mode ([TESTER-MODE.md](TESTER-MODE.md)) is exercised at three levels:

- Pure parts (unit): the cheat state edits, `testerCapture` flag, cheat-replay refusal and save edits in `src/core/tester/tester.test.ts`; the session, throwaway save slot and `keepProgress` routing in `src/game/platform/tester/session.test.ts`; the key sequence, bench row view and badge text in `src/ui/tester/tester-ui.test.ts`; the Capture notices in `src/ui/screens/objectives.test.ts` and `src/game/hud/action-bar.test.ts`.
- End to end (`tests/e2e/tester-mode.spec.ts`): the normal path (four stepped wins, objectives, chapter 2, Capture unlocked, usable at <=25% HP, captured monster joins the garrison) and the tester path (code, 3 heroes in a chapter-1 save, Capture, swap, benched health rising monotonically to the rest cap through `arena.bench()`, instant swap, real save untouched, replay flagged `cheats`).
- Guards: `tests/repo/replay-fixtures.test.ts` asserts no golden replay is a cheat replay; `tools/sim/run-match.ts` (balance gates) and `tools/gen/record-golden.ts` call `assertNoTesterFlags`.

The test hook (`window.__TTE__.arena`) gained `bench()`, `swapReadyTick()`, `cheat(c)` and richer `actionSlots()` (kind, label, disabled).

## DOM unit tests (happy-dom)

DOM-only code (menus, settings, key bindings, touch controls, pause dialog, the `el`/`byId` helpers, the About screen, the tour map SVG) is unit tested with happy-dom (already a devDependency; jsdom is not used). Give each new `src/ui` screen with DOM code a `*.dom.test.ts` next to it. Name the file `*.dom.test.ts`: the
`dom` vitest project (`vitest.config.ts`, environment happy-dom, `src/**/*.dom.test.ts`) runs it and the `core` project excludes it; keep the
`// @vitest-environment happy-dom` first line too so editors and a single-project run behave the same. Every other test stays in node.
`pnpm test:coverage` runs `core` + `dom` and checks per-directory floors (`src/core`, `src/ui`, `src/game`) in the vitest config. happy-dom
differs from browsers in places (no `setPointerCapture`, `FormData` includes disabled controls); keep those checks in e2e.

**Lazy `import()` and fixed-count flushes**: code that lazy-loads chunks (`AppFlow`) makes the first `import()` a real-time module
transform, which can outlast a "yield N macrotasks" helper under CPU load (this made `src/game/app/flow.dom.test.ts` flaky in the full run).
Warm those modules in `beforeAll` so later imports resolve as microtasks, or wait on the real condition (`vi.waitFor`), not a tick count.

## The GPU PC (browser e2e over ssh)

`tools/dev/remote-run.sh` runs a command in the offload clone on the Windows 4060 PC (WSL Ubuntu). Headless Chromium there used to
get no animation frames (`requestAnimationFrame` never fired, `page.screenshot` timed out, Playwright "element is stable" hung),
which made every e2e run red for no game reason. Cause, measured with a blank-page frame count: WSLg exports `DISPLAY=:0` and
`WAYLAND_DISPLAY=wayland-0` into the ssh session, and with them set the project's SwiftShader launch got frames in about 1 of 8
launches; with both unset it got 60 frames per second (WebGL still on) in 20 of 20 fresh ssh sessions. The script now unsets both
for every job. `--disable-features=Vulkan` also worked in a 5-launch trial (kept as a backup, not applied). Do not use
`--use-gl=disabled`: it gives frames but removes WebGL. Not tested: Windows locked or display off.

For commands that mention `e2e` or `playwright` (or with `--preflight`) the script first runs `tools/dev/pc-frame-check.cjs`: a blank
page must get at least 10 frames in 1 s and a screenshot within 5 s. A stall is reported as `status: error` (exit 96), not as a test
failure, and the command is not run. `--no-preflight` skips it. To probe by hand: `node tools/dev/pc-frame-check.cjs` in the clone
with `unset DISPLAY WAYLAND_DISPLAY`.

### When a change needs a browser run (owner, 2026-11-19)

- **Message-only spec edits** (titles, `expect` messages, helper wording; no selector, flow, assertion or timeout change): `gate:commit` is enough to merge. The nightly full run is the net; do not queue a short-lane run for them.
- **Spec or app changes that alter behavior:** run `e2e:smoke` plus the touched specs through the router, once.
- **While a full run holds the PC** (check `pnpm pc:probe`): do not start short-lane runs. Wait, or let the nightly run be the net. A red from a run that overlapped a full run is suspect (closed browser, `state lost` rc 93); re-run once alone before treating it as real.
- **Pushing after a full run (owner, 2026-11-19): no new reds, not a percentage.** A completed full run lists each red by file and title. Reproduce each once alone on the short lane, and every red also gets a follow-up stress task: a repeated run of that spec alone (`pnpm e2e:flake`, PC only, for example 20 repeats), filed as an `ideas/` file so it is not lost. The stress result classifies it: fails every time = real regression; fails some repeats = flaky, and the cause is the test (timing, a missing wait) or the app (a race), so fix the code, the test or both; never fails = could not reproduce, keep the note and watch the next nightly run. A red that does not repeat on the single re-run is flaky until the stress run says otherwise; a red that repeats and is not already known is new. Push when every red is flaky or already known and none is new since the last green push. A new repeating red blocks the push until it is fixed or its change is reverted. Each known red gets an `ideas/` file and a `tools/ci/known-red.json` entry (the "ticket"), and the fix loop applies (Sonnet builder in a worktree, `gate:commit` plus the touched spec, two failed attempts means it stays recorded). A run that did not finish (cancelled, `lost`) is not a verdict: re-run it. A pass-rate threshold such as 90% is not used; it would allow dozens of failures in one feature area.

### Routing e2e to the PC

`tools/ci/e2e-route.ts <run|smoke|pages|itch|flake>` (the `pnpm e2e*` scripts) sends Playwright to the PC **by default** (owner, 2026-11-18): whenever `TTE_REMOTE` or `git config tte.remote <ssh-alias>` is set (the main checkout has it; set it in a new clone or worktree that does not inherit it; never commit the host, IP, user or key), and otherwise runs locally in a browser slot. `CI`, `TTE_E2E_LOCAL=1` and `--list`
force local. `pnpm e2e:remote` forces the PC; `e2e:local` is refused while a remote is configured unless `TTE_ALLOW_MAC_E2E=1`.

- **Lanes:** a short lane (port 7970) and a full lane (port 7960); more than 150 tests times the repeat count picks full
  (`--pc-lane`, `--full` override). A busy lock exits 95.
- **Jobs:** the source is bundled from git, uploaded, and run detached under `~/tte-offload/jobs/<id>/`; results are fetched to
  `.scratch/remote-e2e/<id>/` (report, results.json, test-results, output.log, health.csv, e2e-server.log). Ctrl-C cancels the PC job (exit 130) unless `--pc-detach`; use `--pc-attach` / `--pc-status` later.
- **Exit codes:** 92 bundle verify, 93 lost/reboot, 94 unreachable, 95 lock busy, 96 frames stall, 3 upload/fetch failure, 2 usage.
- **PC first, Mac fallback:** a cached probe (`pnpm pc:probe`, 60 s TTL) and a pure decision function choose run, wait or fall back. Only short runs (<= 150 tests; run, smoke, pages, itch; not `--pc`, `--pc-detach`, `--full`) may fall back to the Mac, in a browser slot with a load guard (`TTE_MAC_LOAD_MAX`, default 14), and never after a PC exit 0 or 1. Policy: `--pc-fallback <mac|wait|fail>` or `TTE_E2E_FALLBACK`. Exit 89 means no runner (PC unavailable and the Mac too loaded), 97 PC needs setup. The last stderr line is `e2e ran on: PC (...)` or `e2e ran on: Mac (fallback: <reason>)`.
- **Where heavy jobs run:** `tools/ci/offload-routes.json` (validated by `tests/repo/offload-routes.test.ts`).
- **Queued full e2e (opt-in):** `TTE_E2E_VIA_QUEUE=1 pnpm e2e` submits the run as a raw job (id `raw-<id>`) to the `cpu-full` lane of the GPU job server (`runQueued`) instead of using the direct lock. Full lane only; short runs keep the router. Extra exit codes: 93 lost, 94 unreachable, 95 busy, 97 not set up or version mismatch, 130 cancelled (Ctrl-C cancels the queued job). There is no Mac rerun after any of these. `--pc-detach` leaves the job queued, `--pc-attach raw-<id>` follows it later, `--pc-cancel raw-<id>` cancels it. One-time: run `pnpm gpu:setup` to deploy the new `ctl.py` (without it the run exits 97). Compare the first live queued run with a direct full run before relying on it.
- **Agents:** run only `@smoke` plus the specs you touched (`pnpm e2e:smoke`), never the full suite; never force a Mac run or rerun a red result on the other machine; copy the `e2e ran on:` line into the report and report exits 89/94/95/96.

### Tiered gate (`tools/ci/gate.ts`)

- `pnpm gate:commit` (T1, Mac, target under 5 min, no browser): lint, typecheck, depcruise, test, test:dom, test:legacy, build, size:check. lint and test run concurrently (buffered output printed in step order, the other is killed on the first failure; eslint caches in `.scratch/eslintcache`, keyed on file content and config; `gate:commit` lints only files changed vs the merge-base with main plus dirty ones, and everything for `--full`, `gate:push`, `--hook` or a change to eslint.config.*, tsconfig*, package.json or pnpm-lock.yaml), the rest in sequence. Fail-fast; `--keep-going`, `--full`, `--force` (ignore a stamp), `--json`, `--no-stamp`, `--hook` (for a pre-push hook: keyed on HEAD, quiet). Exit 0 pass, 1 a step failed, 2 usage or hook refusal.
- Pre-push hook docs-only rule (`.claude/hooks/pre-push-local-ci.sh`): for a plain `git push [origin [HEAD|<current branch>]]` whose range `origin/main...HEAD` (renames split into delete + add) touches only `.claude/`, `docs/`, `ideas/` or `*.md`, the hook runs `pnpm exec vitest run tests/repo` instead of `gate:commit` (many repo tests read those trees), then `gate:push --verify` as usual, and prints which rule applied. Any other change runs `gate:commit --hook` then `gate:push --verify`.
- `pnpm gate:push` (T2): T1 (reused through its stamp), then `@smoke` plus the specs `tools/ci/touched-specs.ts` selects, run through the e2e router (PC first, Mac fallback only for short runs). Flags: `--base <ref>`, `--budget <s>`, `--max-tests <n>`, `--dry-run` (selection and router argv, runs nothing), `--verify` (no browser: passes when no e2e-relevant file changed since `origin/main` or a passing push stamp exists). It refuses (exit 2) when `CI`, `TTE_E2E_LOCAL` or `TTE_ALLOW_MAC_E2E` is set or no PC is configured; the router's own exit codes (89, 94, 95, 96) are passed through and never retried. A run counts as passed on router exit 0 or when the router output has a `VERDICT: PUSH OK` line (only P2, known or flaky reds), in which case `gate:push` exits 0 and writes the stamp; BLOCKED, HOLD, NO VERDICT or no verdict line stay failures. Over about 8 min: Bash `run_in_background`.
- Stamps are JSON files in `<git common dir>/tte-gate/` (shared by all worktrees), keyed by tree id (T1) or by a hash of the e2e-relevant blobs in HEAD (T2). `.claude/agent-memory`, `tools/ci/e2e-durations.json`, `tools/ci/long-gate-status.json` and `ideas/brainstorm/long-gate-*.md` do not change a T1 key. A stamp is convenience evidence, not proof; the newest 200 per kind are kept.

### E2E test tiers (`tools/ci/test-tiers.json`)

Every e2e test has a tier: **P0** core flow (boot, menu, Play/Versus/Tour/online to a result, pause, save integrity; every `@smoke` test), **P1** features (abilities, pickers, Help, Settings, a11y, replay, supers, stages), **P2** polish and edge (screenshots, cosmetic fx, layout at odd sizes, phone, portrait and touch, which is parked: since 2026-11-19 the phone, portrait-play and touch-viewport e2e specs are deleted because the game does not support phones; the touch code and its unit/dom tests stay). Push rule: a new repeating red in a P0 or P1 test blocks the push; a P2 red is recorded (nightly known-red) and does not block.

`tools/ci/test-tiers.ts` exports `tierOf(file, title, tags)` and `loadTiers()`. Resolution order: `@smoke` tag (P0), per-test `overrides` (file plus title substring, first match), `titleRules` ("reduced motion", "phone", "portrait", "touch" drop to P2 unless the file is P0), the per-file tier in `files`, then `defaultTier` (P1). A new spec must get a `files` entry; `tests/repo/test-tiers.test.ts` fails otherwise.

### E2E report (`report.md`)

Every Playwright run through the router also writes, next to the usual reports, `results.jsonl` (one JSON line per test attempt, appended live so a lost job still leaves a partial file) and `report.md` (written at the end). On the PC they land in the job's out dir and are fetched to `.scratch/remote-e2e/<id>/`; on the Mac they go to `.scratch/e2e-report/latest/` (override with `TTE_REPORT_DIR`). After a PC run the router prints the `VERDICT:` line and the report path. Code: `tools/ci/e2e-report.ts` (pure logic) and `tools/ci/e2e-reporter.ts` (the reporter; every hook catches its own errors, so a reporter bug never fails a run). The PC job adds the reporter only when the checked-out sha has the file.

Line 1 is the verdict: **BLOCKED** (a new repeating red in a P0 or P1 test: failed on every attempt, needs retries, so the short lane), **HOLD** (a new P0/P1 red that failed once with no retry, as in the full lane: re-run it alone first), **PUSH OK** (everything else; flaky, known and P2 reds are listed but never block), **NO VERDICT** (the run was interrupted, timed out or ran no tests). Then run details (commit, lane, job, duration, workers, retries), a count table per tier, and for each red: tier, file, title, last step, first error line, trace path, console or page errors when attached, flaky/known/new, a stress command (`pnpm e2e:flake --repeat 20 --grep ...`) and a "what this means" sentence. "Known" means a match in `tools/ci/known-red.json` (same spec file, title contains the entry's text) or a non-done `ideas/` file that names the spec file and the title (or its first 40 characters); anything else is "new". The trace may be missing when the PC fetch size cap dropped it.

### GPU job server (`tools/gpu-queue/`)

`pnpm gpu:submit|status|list|cancel|log|fetch|wait|setup|admin` queue GPU model jobs and CPU worker tasks on the PC through pueue
(`ctl.py` on the PC is the only pueue client; per-session ownership, thermal/RAM watchdog, 14-day retention). Its tests run with fakes
and need no PC: `python3 -m unittest discover -s tools/gpu-queue` (also run by `tests/repo/gpu-ctl-py.test.ts`, skipped without
python3) and `tests/repo/gpu-jobs-cli.test.ts` (fake ssh in `tests/repo/fixtures/fake-ssh.sh`). Full e2e can use it as raw jobs on the `cpu-full` lane (see "Routing e2e to the PC").

## Nightly full e2e (PC, launchd)

`tools/ci/nightly-e2e.ts` runs the full e2e suite on the PC every night, in two phases so a sleeping Mac cannot lose a run.
`pnpm nightly:submit` (23:00) fetches `origin`, checks out the tip of local `main` (pushed or not; the router bundles unpushed commits, so the safety net covers what is merged even while a push is gated) in the detached worktree `.scratch/nightly-wt` and queues the full
suite on the `cpu-full` lane through the router (`TTE_E2E_VIA_QUEUE=1 ... --full --pc-detach`), recording `pending` with the raw job id.
`pnpm nightly:collect` (07:30) follows that job (`--pc-attach raw-<id>`), reads `results.json` and records `pass`, `red` or `not-run`.
`pnpm nightly:status` prints the result. It refuses to run with `CI`, `TTE_E2E_LOCAL` or `TTE_ALLOW_MAC_E2E` set and never falls back to the Mac.

- Health: every PC job samples `health.csv` (ts, load1, free RAM, GPU, nproc) every 30 s and writes `nproc` to `run-summary.txt`; both are copied into `out/` so they are fetched, and the router prints a one-line load/nproc summary (use it to pick a worker count).
- Status: `<git common dir>/tte-gate/nightly-status.json` (shared by all worktrees; `nightly-history.jsonl` keeps 60 runs, `nightly.log` the output).
  States: `pass`, `red` (failed tests listed by file and title; `unrecorded` = not covered by `tools/ci/known-red.json`, loaded tolerantly by `tools/ci/known-red.ts`: `{"schema": 1, "entries": [...]}`, each entry `{file, titleIncludes, tier, firstSeen, idea, status}` with `status` `open` or `fixed` (fixed entries no longer match); `tests/repo/known-red.test.ts` checks the schema and that every `idea` file exists; the list is empty until a red reproduces),
  `not-run` (PC unreachable/busy/not set up/lost/cancelled, exits 93 94 95 96 97 130; nothing was learned, never pass), `pending`.
- A status older than 36 h counts as `not-run`. Stale and not-run only warn (owner, 2026-11-19); nothing blocks a push yet.
- Schedule: `pnpm nightly:install` renders `tools/ci/launchd/dev.tte.nightly-e2e.plist.tmpl` into two LaunchAgents in
  `~/Library/LaunchAgents` (paths for the repo, corepack and PATH are filled in at install time, never committed; launchd runs a missed
  job once on wake). `--dry-run` prints them, `--uninstall` removes them.
- Tests: `tests/repo/nightly-status.test.ts` (pure logic), `tests/repo/nightly-e2e-cli.test.ts` (fake runner),
  `tests/repo/nightly-install.test.ts` (template has no host, user path or key). The live submit/attach path is untested until the first real night.

### Nightly runbook (diagnose and fix)

**How it runs.** Two LaunchAgents, `dev.tte.nightly-e2e-submit` (23:00, runs `nightly-e2e.ts submit`) and `dev.tte.nightly-e2e-collect` (07:30, runs `collect`), installed by `pnpm nightly:install` from `tools/ci/launchd/dev.tte.nightly-e2e.plist.tmpl` into `~/Library/LaunchAgents/<label>.plist`. Submit works in the detached worktree `.scratch/nightly-wt` (created on first use, then `git checkout --detach --force <sha>`); collect only reads the PC job.

**Where state lives**

| What | Path |
|---|---|
| Latest status | `<git common dir>/tte-gate/nightly-status.json` (`git rev-parse --path-format=absolute --git-common-dir`) |
| Last 60 runs | `<git common dir>/tte-gate/nightly-history.jsonl` |
| Script output (both phases) | `<git common dir>/tte-gate/nightly.log` |
| Collected Playwright JSON | `<git common dir>/tte-gate/nightly-results.json` |
| launchd stdout/stderr | `~/Library/Logs/dev.tte.nightly-e2e-submit.log`, `~/Library/Logs/dev.tte.nightly-e2e-collect.log` |

**Reading the status** (`pnpm nightly:status`, always exits 0; the JSON also has `reason`, `exit`, `rawId`, `ranOn`)

- `pass`: full run finished, no failures (`flaky` may still list tests that passed on retry).
- `red`: finished with failures. `failed` lists file and title; `unrecorded` is the subset not covered by `tools/ci/known-red.json`. Those are the ones to act on.
- `pending`: submitted, not collected. Normal between 23:00 and 07:30. If it is still pending the next day, collect did not run or could not finish: run `pnpm nightly:collect`.
- `not-run`: nothing was learned, never read it as pass. `reason` says why: `git fetch failed`, `could not prepare the nightly worktree`, `no job id from the router`, `submit failed`, or the router exit code below.
- Exit codes recorded in `exit`: 89 not routed to the PC, 93 PC job lost (closed browser or `state lost`; also what an overlapping run can cause), 94 PC unreachable, 95 PC busy, 96 PC refused the job, 97 PC not set up (run `pnpm gpu:setup`), 130 cancelled. Any other code shows as `router exit N`; 0 or 1 without a `results.json` shows `no results.json`.
- **Stale:** a status whose `finishedAt` (or `startedAt`) is over 36 h old prints `STALE` and counts as `not-run`. It means a night was missed (Mac asleep or off, agents not installed, submit never reached the PC). Warning only; nothing blocks a push on it yet.
- `nightly-e2e.ts` exits 2 (and runs nothing) if `CI`, `TTE_E2E_LOCAL` or `TTE_ALLOW_MAC_E2E` is set in its environment. There is no Mac fallback by design.

**Diagnosis commands**

```sh
corepack pnpm nightly:status                                  # what was recorded, with stale warning
tail -n 60 "$(git rev-parse --path-format=absolute --git-common-dir)/tte-gate/nightly.log"
tail -n 40 ~/Library/Logs/dev.tte.nightly-e2e-submit.log ~/Library/Logs/dev.tte.nightly-e2e-collect.log
launchctl list | grep tte                                     # loaded? (second column = last exit status)
launchctl print gui/$(id -u)/dev.tte.nightly-e2e-submit       # schedule, program, last exit
launchctl kickstart -k gui/$(id -u)/dev.tte.nightly-e2e-submit   # run it now (same for -collect)
corepack pnpm pc:probe                                        # PC health, load, whether a full run holds it
corepack pnpm gpu:status                                      # job server queue; gpu:log shows a job's output
```

`launchctl kickstart -k` restarts the job if it is already running; `pnpm nightly:submit` and `pnpm nightly:collect` run the same code in the foreground when you want to watch it.

**Fixes for the common failures**

- **`not-run`, `PC not set up` (97) or `no job id from the router`, or the router says it would run locally:** `git config tte.remote` is missing in the checkout that launchd runs (worktrees do not always inherit it). Set `git config tte.remote <ssh-alias>` in the main checkout (never write the host, IP, user or key into the repo), then `pnpm gpu:setup` if the job server is missing, then kickstart submit.
- **`PC unreachable` (94) or `PC busy` (95):** run `pnpm pc:probe`. If the PC or its WSL has gone idle or asleep, wake it with `pnpm gpu:status`, then retry. If another session's job holds it, wait: never kill another session's job. The status stays `not-run`; kickstart submit once the PC is free, then collect.
- **Mac asleep at 23:00:** launchd runs a missed calendar job once on wake, but that can be late and the Mac is also needed at 07:30 for collect. The job lives on the PC, so a late collect is fine (`pnpm nightly:collect`). To keep the Mac awake overnight use System Settings, Battery (or Energy) "prevent automatic sleeping on power adapter", or run `caffeinate -i -t 28800 &` before leaving; `pmset -g log | grep -i -E "sleep|wake"` shows what the Mac did.
- **Stale lock (a router or PC job lock left from a killed run):** `pnpm pc:probe` and `pnpm gpu:status` show whether a job is really running. If nothing is running and submit keeps reporting busy or refused, cancel only your own dead job through `pnpm gpu:cancel`, and see [.claude/rules/gpu-pc.md](../.claude/rules/gpu-pc.md) for the exit codes. Do not delete files on the PC by hand.
- **Dirty or broken `.scratch/nightly-wt`** (`could not prepare the nightly worktree`): it is a throwaway detached checkout. From the repo root run `git worktree remove --force .scratch/nightly-wt` (or, if git no longer knows it, `rm -rf .scratch/nightly-wt && git worktree prune`), then kickstart submit, which recreates it. Never edit files in it.
- **Agents missing or wrong path (repo moved, corepack changed):** `pnpm nightly:install --dry-run` prints the rendered plists, `pnpm nightly:install` (re)installs both (it boots out the old ones first), `pnpm nightly:install --uninstall` removes them (`--dry-run` with it only prints). Paths for the repo, corepack and `PATH` are fixed at install time, so reinstall after moving the checkout or upgrading node.
- **`pending` forever:** the PC job may be gone. Run `pnpm nightly:collect`; if it records `not-run` with 93, treat the night as lost and resubmit with `pnpm nightly:submit`.

**After a red night.** Every failure is fixed or recorded in `tools/ci/known-red.json` (with an `ideas/` file) before the next push; the full push rule, the single re-run and the `pnpm e2e:flake` stress run are in "Pushing after a full run" above. A `not-run` or stale night is not a verdict: re-run it, do not treat it as green.
