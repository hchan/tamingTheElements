# Performance budgets

Four gates keep the game fast. All are deliberately generous where the machine matters (CI is shared, SwiftShader is software
rendering) and strict where the number is deterministic (bytes). The design target is a sim tick under 0.5 ms so rollback can
resimulate several ticks in one 16.6 ms frame.

| Gate | Command | Where | Bound | Measured (2026-11) |
| --- | --- | --- | --- | --- |
| Bundle size | `pnpm size:check` | `check` job, `ci:local` | per-chunk gzip budgets in `tools/ci/size-budget.json` | index 27.8 KB, core 10.9 KB, sim 15.8 KB, phaser 353.3 KB, phaser-config 16.5 KB, css 3.0 KB |
| Menu is Phaser-free and sim-free | `pnpm size:check` | same | `index.html` and the entry chunk never reference or statically import the `phaser` or `sim` chunk | passes |
| Sim speed | `tests/repo/sim-perf.test.ts` (`pnpm test`) | `check` job | median tick under 0.5 ms; 1000 ticks under 2 s | 0.036 ms/tick, 36 ms per 1000 ticks |
| Sim allocation | same file | same | no retained growth over 20000 ticks | heap +0.003 MB, ArrayBuffers +0 B |
| Frame time | `tests/e2e/perf.spec.ts` (`pnpm e2e`) | `e2e` job | average frame under 250 ms, under half the frames over 100 ms (SwiftShader) | avg 17 ms, max 117 ms, 1 long frame |
| Menu load | same | same | no Phaser request on first load; under 150 KB transferred; interactive under 10 s | 36 KB, 31 ms, 3 requests |

## How each is measured

- **Bundle size.** `tools/ci/size-check.ts` gzips (level 9) every `dist/` file and keys it by name without the content hash
  (`assets/index-BRhiXssy.js` is `index`). Each chunk, and the total, must be within `size-budget.json`. A chunk with no budget or a
  budgeted chunk that disappeared also fails, so renames are noticed. Budgets are the measured size plus about 3% for the menu chunks (`index`, `core`, `sim`, ...; `phaser` keeps 10%). Run it after
  `pnpm build`; an e2e run writes a `--mode test` build to `dist/` that is slightly larger.
- **Phaser stays out of the menu.** The script checks that `index.html` has no reference (script, modulepreload, link) to the
  `phaser` chunk and that the entry chunk does not statically import it, transitively. Phaser is loaded by a dynamic
  `import()` of `phaser-config` when play starts. The e2e menu probe confirms it at runtime from the network log and the
  Resource Timing entries.
- **The sim is its own chunk.** `vite.config.ts` (`build.rolldownOptions.output.codeSplitting.groups`) pins `phaser`, `core` (data,
  rules, save, rng: shared by the menu and the sim, preloaded by `index.html`) and `sim` (`src/core/sim|agents|replay|net`, the
  scripted AI and the playtest recorder). The menu graph imports core through `src/core/menu-index.ts` only and reaches the sim
  through `import('@core/lazy-index')` (random bot at match start, replay validate/format on download and in the viewer);
  `main.ts` fetches that import when the menu is idle. Before (2026-11, WP-sim-chunk): `index` 49.8 KB gzip held all of core and
  grew about 700 B per Arcade package. After: `index` 27.8 KB + `core` 10.9 KB = 38.8 KB the menu must download (-11.1 KB, -22%;
  html and css are unchanged), `sim` 15.8 KB lazy, `arcade-versus` 2.8 KB (its scripted AI moved into `sim`). Total gzip went from
  429.7 KB to 431.1 KB (three small extra chunks). New sim code now grows `sim`, not `index`. `size:check` also fails if the entry
  graph statically imports `sim`.
- **Lazy features stay out of the entry chunk.** Arcade Versus is its own `arcade-versus` chunk (about 2.8 KB gzip, budget
  2840), imported when `#arcade` opens; the scripted AI it needs is exported from `src/core/lazy-index.ts` (it lives in `sim`).
  `lazy-index` is imported dynamically, so its namespace keeps every export alive: it names its exports (WP-arcade-ai-personalities
  replaced `export *` from the scripted-ai barrel, `lazy-index` 536 B to 228 B gzip), and the Arcade AI keeps its tables in
  `scripted-ai/arcade-ai.ts`, outside the barrel, so they are inlined (that WP took `sim` from 19178 B to 19699 B of its
  19700 B budget and `arcade-versus` from 3249 B to 3175 B). Every function a lazy chunk imports from `index` is one more export there, and the
  renamed exports can move `phaser-config` by a few bytes, so keep those imports few. Dev and test-only code is behind a
  static `import.meta.env.DEV || import.meta.env.MODE === 'test'` test (`getUiFlags`, `arcadeEnabled`, the Arena's
  `?ff=arcade` demo) so production bundles drop it. The Arcade round HUD (WP-arcade-announcer-view) is its own `round-view`
  chunk (2.0 KB gzip), imported by the Arena only in Arcade matches, so Classic never downloads it and `phaser-config`
  pays the import call and the event hand-off (about 250 B with the round score in the match-end line). The Arcade
  defence view (WP-arcade-defence-view, 3.3 KB gzip, budget 3450) is a `defence-view` chunk that `round-view` imports
  statically: a `codeSplitting` group in `vite.config.ts` keeps it separate, with `includeDependenciesRecursively: false`
  so the group does not pull the shared colours and viewport out of `phaser-config` (which would make `phaser-config`
  import it statically, Classic included). `phaser-config` pays one more preload entry and one argument (about 25 B); the
  dash and guard bindings were paid for by writing the pad table's button indices as numbers (about 90 B). The Arcade
  weather view (WP-arcade-weather-view, 2.9 KB gzip, budget 3060) is a `weather-view` chunk set up the same way;
  `phaser-config` pays one more preload entry (about 15 B, with the weather binding: 16956 to 16970 B, budget 17000), and
  `round-view` the mount (2096 B, budget 2100; it hands the weather view the defence view's consumer so it holds one).
  The Arcade clash burst (WP-arcade-clash, 915 B gzip, budget 943) is a `clash-view` chunk set up the same way and
  mounted by `defence-view` (3346 to 3378 B, budget 3450), since `round-view` has no room for another mount;
  `phaser-config` pays one more preload entry (16973 to 16984 B, budget 17000). The clash rules add 415 B to `sim`
  (19178 to 19593 B, budget 19700). The Arcade audio layers (WP-arcade-audio-layers, 1843 B gzip, budget 1899: the
  measured size plus 3%, since the total budget has little room) are an `arcade-audio` chunk loaded by `arcade-versus`
  (3170 to 3221 B, budget 3250) from its `arcadeView` hook, so `phaser-config` pays nothing (16980 B). The chunk imports
  core and the audio manager as types only, with the event kinds as numbers checked by type or by a test: a value import
  would wrap its `import()` in Vite's preload helper with a dependency list, and loading it from `weather-view` that way
  had pulled the helper (and two more preload entries for `round-view`) into the Arcade chunks. The Arcade tag-team view
  (WP-arcade-tag-view, 2720 B gzip, budget 2802 = measured + 3%) is a `tag-view` chunk mounted by `weather-view` (2973 to
  2999 B, budget 3060), set up like the others; it copies the HUD bar geometry and the swap-slot position (pinned to
  `bars.ts` and `action-bar.ts` by a test), since importing those modules grew `phaser-config`'s export list by about
  40 B and importing `action-bar.ts` split the shared viewport code into a chunk of its own. To fit the 2v2 picker in
  `arcade-versus` without raising its budget, the match builder, the Arcade AI wiring and the aim arrow moved to their own
  `arcade-setup` chunk (1369 B gzip, budget 1410), loaded with the battle: `arcade-versus` went from 3225 to 2974 B with
  the team-size and partner selects. Load it with `.then(({ name }) => ...)` destructuring: a `Promise.all` of two
  dynamic imports made Rolldown keep `phaser-config`'s whole namespace (about 80 B). Total 449586 to 453370 B (budget
  453800, unchanged).
- **Sim speed.** `tests/repo/sim-perf.test.ts` plays a 2-team, 2-member-per-team match (Fiara and Curomo: fireballs and ice
  projectiles, adrenaline and fire dance statuses refreshed every 60 ticks) with a pre-built pseudo-random command stream. It checks the
  workload really produces projectiles and statuses, warms up, then times 1000 ticks seven times and asserts on the median per
  tick and the fastest total. The test lives in `tests/repo/` rather than `src/core/` because it needs `performance` and `process`,
  which `src/core` must not see.
- **Sim allocation.** Two checks. (1) Structural: after 3000 ticks every typed array in `SimState` is the same object on the same
  `ArrayBuffer`, so `step()` never reallocates state. (2) Heap heuristic: force a full GC, run 20000 ticks, force a GC again, and
  require less than 4 MB of retained heap growth and under 1 MB of ArrayBuffer growth. Per-tick garbage (the event sink and event
  objects) is allowed and not measured: it dies young. The gate catches leaks and retained per-tick allocation, not churn.
- **Frame time.** The e2e probe opens the arena in manual mode, warms up, then for 180 `requestAnimationFrame` callbacks steps
  the sim one tick per frame and records the frame-to-frame delta, plus Long Tasks if the browser reports them. Average, p95,
  max, long-frame count and long-task count are attached to the report (`frame-time.json`) and logged.
- **Menu load.** Measured with `performance.now()` when the test hook is ready and the menu is visible, and with
  `transferSize` over Resource Timing plus the navigation entry.

## Changing a budget

Raise a budget only when the growth is intended and cannot be deferred or lazy-loaded.

1. `pnpm build && pnpm size:check --print` shows the measured sizes and a suggested file (measured plus 10%).
2. Edit `tools/ci/size-budget.json` and say in the commit message what grew and why.
3. For the sim and e2e bounds, edit the constants at the top of `tests/repo/sim-perf.test.ts` or `tests/e2e/perf.spec.ts`
   with a comment explaining the new number. Loosening a bound for a slow runner is not a reason; find the regression.

## Deliberately not gated

- Real GPU frame rate and mobile devices: SwiftShader numbers say nothing about them. The frame probe only catches gross breakage.
- Per-tick garbage from event objects (see above), and Phaser's own allocation.
- Phaser chunk size beyond its budget: it is about 353 KB gzip and unavoidable until a custom Phaser build is justified.
- Asset download size (art, audio): not part of `dist/assets/*.js|css`; track it separately if it becomes a problem.
- Cold-start on slow networks: the menu load probe runs against localhost.
