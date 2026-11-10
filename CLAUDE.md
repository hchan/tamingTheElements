# tamingTheElements

Real-time 1v1 elemental arena battler with monster capture. Ported from a legacy Crafty.js game (`war/`, frozen as the
parity oracle, tag `legacy-crafty-1.0`) to **Phaser 4 + TypeScript + Vite**, with a deterministic 50 Hz simulation in plain
TypeScript (`src/core`, no Phaser/DOM) and Phaser as a thin renderer. Live: https://hchan.github.io/tamingTheElements/

Start with [README.md](README.md), then [docs/REPO-MAP.md](docs/REPO-MAP.md) (a test pins it), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DETERMINISM.md](docs/DETERMINISM.md), [docs/TESTING.md](docs/TESTING.md) and [docs/PARITY.md](docs/PARITY.md).

## Commands (use `corepack pnpm`; `pnpm` may not be on PATH)

- Gate before every commit: `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test && pnpm test:legacy && pnpm build`
- Browser: `pnpm e2e` (Playwright, SwiftShader, 1 worker; must pass several runs in a row), `pnpm e2e:pages`, `pnpm e2e:itch`
- Sim tools: `pnpm sim:match --tournament --json`, `pnpm balance:compare` / `balance:record`, `pnpm golden:record`
- Dev: `pnpm dev`; flags in the URL (`?ff=arenaDemo`, `?ff=play`, `?manual=1`, `?seed=`) only work in dev/test builds.

## Rules

- **Trunk-based** ([docs/BRANCHING.md](docs/BRANCHING.md)): `main` is always green and deployed on push (Pages). Small branches or small commits, one
  work package each, `git merge --no-ff` with subject `Merge <what> (<WP id>)`. Re-run the gate after every merge (conflict
  markers and silent collateral deletions have slipped through merges before; `git grep -nE '^(<<<<<<<|>>>>>>>) '`).
- **Commits/pushes:** the user has explicitly authorised small commits and regular pushes to `origin/main` for this project;
  never force-push, never rewrite history, never push other branches.
- **Scratch/temp** files go under `~/claudetmp/`, never `/tmp/`.
- **`src/core` determinism:** no `Date`, `Math.random`, or `sin/cos/tan/atan2/exp/log/pow/hypot/cbrt/**` (differ across engines; ESLint enforces).
  Time = the tick; randomness = seeded sfc32 streams (`src/core/rng`); data via LUTs/integers. Golden replays must match in Node,
  Chromium, Firefox and WebKit.
- **State gotcha:** `SimState.team` is per-ENTITY (index by entity id); `SimState.teams` is the per-TEAM block (team-level counts; index with
  `TEAM_STRIDE`/`TeamField`); `SimState.abil` holds ability cooldowns and active counts per CHARACTER (`cooldownIdx`, as legacy
  `abilitiesInfo`). `SimState.arcade` is a zero-length array unless `rulesetArcade` is on (Arcade-only state). All are
  `Int32Array`; `tests/repo/no-team-block-alias.test.ts` guards the team aliasing.
- **Legacy bugs:** replicate and record in [docs/legacy/KNOWN-BUGS.md](docs/legacy/KNOWN-BUGS.md) (with an `it.fails` test); fix on purpose, never silently.
  Re-recording goldens/baselines (`golden:record`, `balance:record`, `TTE_UPDATE_FIXTURES=1`) needs a stated reason in the commit.
- **Async teardown:** Phaser's `game.destroy(true)` completes a frame later; wait on `__TTE__.settled()` (never `waitForTimeout`).
  Settings/objectives saves are async (IndexedDB); wait for navigation to `#main`.
- **Do not edit `war/`** (frozen oracle) until the parity sign-off retirement; never read/print credentials (the old
  `user.properties` is in public git history: rotation is the owner's job, see SECURITY.md).
- Keep responses and diffs small; `git worktree` + Sonnet agents were used per work package (see `.claude/`).
