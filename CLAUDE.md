# tamingTheElements

Real-time 1v1 elemental arena battler with monster capture. Ported from a legacy Crafty.js game (`war/`, retired from the tree
on 2026-11-10; preserved at tag `legacy-crafty-1.0`) to **Phaser 4 + TypeScript + Vite**, with a deterministic 50 Hz simulation in plain
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
- **Save work back to the repo:** `~/claudetmp/` is disposable. Anything that produces or explains a committed artifact (art generator
  scripts, rig/bake helpers, balance or analysis scripts, merge helpers worth keeping) moves into the repo (`tools/`) in the same
  commit as its output, with the licence/docs pointing at the in-repo path. Before finishing a work package, check
  `~/claudetmp/` for scripts the commit depends on.
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
- **Legacy game retired (2026-11-10, owner-approved):** `war/` is gone from the tree; it lives at git tag `legacy-crafty-1.0`.
  `pnpm oracle:restore` extracts it to gitignored `.oracle/`, `pnpm test:oracle` runs the characterization tests against it
  (skipped without it); fixtures in `tests/fixtures/legacy` stay (see docs/legacy/ARCHIVE.md). Never read/print credentials
  (the old `user.properties` is in public history and the tag, never extracted: rotation is the owner's job, see SECURITY.md).
- **Phaser 4 skills:** `node_modules/phaser/skills/*/SKILL.md` ships AI-oriented docs (v4-new-features, filters-and-postfx, particles, v3-to-v4-migration, ...). Read the matching one before writing Phaser code; unused so far: Lighting, Filters, `SpriteGPULayer` (see the v4-new-features skill).
- Keep responses and diffs small; `git worktree` + Sonnet agents were used per work package (see `.claude/`).
- **Agents:** up to 5 at once on independent ideas (owner, 2026-11-12: more parallel agents; reviewer agents do first-pass review), each in its own `git worktree` with its own `E2E_PORT`/dev port; Sonnet by
  default, Opus only for risky new sim systems or hard merges. Never two agents on the same shared file (`tools/ci/size-budget.json`,
  `src/core/index.ts`, `docs/REPO-MAP.md`, the asset manifest). The coordinator reviews and merges each result, gate first.
- **Autonomy:** the owner pre-approved design, art and balance changes ("autoapprove all changes"); do not pause for approval, report afterwards.
  Still confirm before irreversible or outward-facing steps (force-push, history rewrite, deleting the legacy tag, credentials, deleting Classic sim code).
- **Ideas:** every idea or todo, including self-generated ones, is a file in [ideas/](ideas/README.md) (brainstorm/in-progress/done). No cap; never add limits the owner did not ask for.
- **Player-facing words:** the menu is Play, Versus, Online, Settings, Help; never show the words Classic, Arcade, ruleset or Capture to players (Snag replaces Capture).
- **Visual work:** check it with real-game screenshots (Playwright, see the play-local skill) before calling it done; art must match Fiara's rigged and baked look.
