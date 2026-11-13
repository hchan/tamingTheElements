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
| `pnpm e2e` | Playwright (`playwright.config.ts`): `tests/e2e/*.spec.ts` against `vite build --mode test` (written to `node_modules/.tte-e2e`, never `dist/`) served by `vite preview` on port 4173 (`E2E_PORT=n` picks another port for parallel worktrees) |
| `pnpm visual:capture`, `visual:pacing`, `visual:regress`, `visual:update` | Visual QA (`playwright.visual.config.ts`, `tests/visual/`): screenshots, videos, frame pacing and screenshot regression; `ci:local --visual` adds them. See [VISUAL-QA.md](VISUAL-QA.md) |
| `pnpm golden:record` | `tools/gen/record-golden.ts`: rewrites the bot-vs-bot goldens in `tests/fixtures/replays/`; `--ruleset arcade` writes only the Arcade goldens (`arcade-1v1.replay.json`: scripted AI; `arcade-moves`, `arcade-weather` and the 2v2 `arcade-tag`: hand-scripted inputs from `tools/gen/arcade-moves.ts`) and leaves the Classic goldens alone |
| `pnpm fun:noise` | `tools/ci/fun-noise.ts`: one (team size, AI level) configuration (`--team-size`, `--ai-level`) played in several seed blocks (`--blocks 4 --block-size 8`, all pairings); prints per metric the block min / mean / max against the tight fun-gate bands, to size the noise before moving a band. Headless, minutes per configuration; run the four of 1v1/2v2 x AI level 2/3 in parallel |
| `pnpm range:probe` | `tools/sim/range-probe.ts`: Arcade 1v1, every pairing, scripted AI (`--seeds 4`, `--ai-level 3`); prints each hero's kit (melee box, projectile speed and travel time) and hits landed by centre-to-centre distance bucket (melee / ranged / other); writes `out/range-probe.json`. Read-only, never touches `src/core` |
| `pnpm fun:report` | `tools/sim/fun-report.ts`: plays AI-vs-AI matches (`--ruleset arcade`, `--team-size 1\|2`, `--all` for 66 pairings) and prints the [FUN-DESIGN.md](FUN-DESIGN.md) section 4 metrics from `tools/sim/fun-metrics.ts`; writes `out/fun-report.json` |
| `pnpm replay:verify <file...>` | `tools/replay-verify.ts`: re-simulates replay files headlessly; exits 1 on a hash mismatch |
| `pnpm docs:gen` | `tools/gen/gen-design-tables.ts`: refreshes the generated tables in `docs/GAME-DESIGN.md` |
| `pnpm lint`, `pnpm typecheck`, `pnpm depcruise`, `pnpm build` | ESLint (including the `src/core` determinism bans), `tsc -b`, dependency rules, typecheck plus Vite build |

Pre-merge set (CI runs lint, typecheck, depcruise, test and build; `e2e` and `test:browser` are separate CI jobs):
`pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test && pnpm test:legacy && pnpm build`.

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
| Hit feedback (fake sinks: 100% feedback coverage over real Arcade matches, reduced motion; the V6 flash in the browser) | `src/game/fx/event-fx.test.ts`, `src/game/views/character-view.test.ts`, `src/game/hud/arcade-hud.test.ts`, `tests/e2e/arcade-juice.spec.ts` |
| Arcade Versus (setup builder, Arcade AI levels, recorded flag, no storage access; no save store in its modules; 2v2: team-size and partner parsing, the AI's seeded partner, the per-hero AI, every hero's end state; e2e: on the menu by default, hit, super from X and the touch button, KO, results, rematch, save untouched, 390x844 picker; the 2v2 picker, tag on 3 and the touch Tag button, KO entrance, 2v2 results) | `src/game/app/arcade-setup.test.ts`, `tests/repo/arcade-no-save-writes.test.ts`, `tests/e2e/arcade.spec.ts`, `tests/e2e/arcade-tag.spec.ts`; the production path (`?ff=` ignored, on by default, lazy chunk under the Pages subpath) in `tests/e2e-pages/pages-arcade.spec.ts` |
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
then drive it with `page.evaluate`. Arena demos start with the `?ff=arenaDemo` flag, cinematics with `?ff=cinematicDemo`.
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
- Known limitation (product): in a real match the first ticks are the 90-tick intro, so a view mounting a few frames late never
  misses a visible event; mounted views do not replay events from before their mount.

### Keeping e2e stable and finding flakes

- **Config** (`playwright.config.ts`, `playwright.pages.config.ts`): `expect` timeout 10 s, `actionTimeout` 30 s (main config) (an unclickable element
  fails fast with a call log instead of eating the 60 s test timeout), `retries: 1` and `trace: 'on-first-retry'` only when `CI` is set.
  Locally retries stay 0. A pass-after-retry is reported as "flaky" by Playwright: treat it as a bug, not as green.
  `E2E_PORT` (main) and `E2E_PAGES_PORT` / `E2E_PORT` (pages, default 4174) let worktrees run side by side.
- **Boot readiness**: main suite `waitForReady` / `gotoReady(page, url)` (`tests/e2e/parity/helpers.ts`) = `__TTE__.ready`; then `waitForRoute`
  (`mountedRoute`) after navigation and `ARENA_READY` for battles. Pages suite (production build, no hook): `gotoMenu` in
  `tests/e2e-pages/helpers.ts` waits for the first menu button to be visible and enabled.
- **Never** `waitForTimeout` in `tests/e2e*` (teardown: `__TTE__.settled()`; async saves: wait for `#main`; Settings/other save-backed
  screens: wait for their own content). Assert on what the player sees; do not click a selector the menu does not have. The menu is
  Play, Versus, Online, Settings, Help; About, Wiki, Key Bindings and Story live on Help (`li[data-route=...] a`).
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

DOM-only code (menus, settings, key bindings, touch controls, pause dialog) is unit tested with happy-dom. Opt in per file with
`// @vitest-environment happy-dom` on the first line and name the file `*.dom.test.ts`; every other test stays in the node environment. happy-dom
differs from browsers in places (no `setPointerCapture`, `FormData` includes disabled controls); keep those checks in e2e.

**Lazy `import()` and fixed-count flushes**: code that lazy-loads chunks (`AppFlow`) makes the first `import()` a real-time module
transform, which can outlast a "yield N macrotasks" helper under CPU load (this made `src/game/app/flow.dom.test.ts` flaky in the full run).
Warm those modules in `beforeAll` so later imports resolve as microtasks, or wait on the real condition (`vi.waitFor`), not a tick count.
