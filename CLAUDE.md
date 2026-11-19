# tamingTheElements

Real-time 1v1 elemental arena battler with monster capture. Ported from a legacy Crafty.js game (`war/`, retired from the tree
on 2026-11-10; preserved at tag `legacy-crafty-1.0`) to **Phaser 4 + TypeScript + Vite**, with a deterministic 50 Hz simulation in plain
TypeScript (`src/core`, no Phaser/DOM) and Phaser as a thin renderer. Live: https://hchan.github.io/tamingTheElements/

Start with [README.md](README.md), then [docs/REPO-MAP.md](docs/REPO-MAP.md) (a test pins it), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DETERMINISM.md](docs/DETERMINISM.md), [docs/TESTING.md](docs/TESTING.md) and [docs/PARITY.md](docs/PARITY.md).

## Commands (use `corepack pnpm`; `pnpm` may not be on PATH)

- Gate before every commit (the local gate is the only per-commit check; Actions runs daily and has no e2e job): `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test && pnpm exec vitest run --project dom && pnpm test:legacy && pnpm build`, plus `pnpm e2e` before pushing (it runs on the GPU PC, next line)
- Browser: `pnpm e2e` (Playwright, SwiftShader, 1 worker; must pass several runs in a row), `pnpm e2e:smoke`, `pnpm e2e:pages`, `pnpm e2e:itch`. **PC first, Mac fallback** (owner, 2026-11-18): `tools/ci/e2e-route.ts` runs e2e on the 4060 PC when `git config tte.remote <ssh-alias>` is set (once per new clone or worktree that does not inherit it; never write the host, IP, user or key into the repo). Only short runs (<= 150 tests) may fall back to the Mac, in a browser slot with a load guard; full runs are PC only. `pnpm pc:probe` shows PC health. Forcing the Mac (`TTE_ALLOW_MAC_E2E=1`) is the coordinator's. Over about 8 min: Bash `run_in_background`. See docs/TESTING.md "Routing e2e to the PC"
- Sim tools: `pnpm sim:match --tournament --json`, `pnpm balance:compare` / `balance:record`, `pnpm golden:record`
- Dev: `pnpm dev`; flags in the URL (`?ff=arenaDemo`, `?ff=play`, `?manual=1`, `?seed=`) only work in dev/test builds.

## Rules

- **Trunk-based** ([docs/BRANCHING.md](docs/BRANCHING.md)): `main` is always green by the local gate; Pages is rebuilt and deployed by GitHub Actions once a day (cron) or on manual `workflow_dispatch`, not on push (owner, 2026-11-17, to save minutes). Small branches or small commits, one
  work package each, `git merge --no-ff` with subject `Merge <what> (<WP id>)`. Re-run the gate after every merge (conflict
  markers and silent collateral deletions have slipped through merges before; `git grep -nE '^(<<<<<<<|>>>>>>>) '`).
- **Commits/pushes:** the user has explicitly authorised small commits and regular pushes to `origin/main` for this project;
  never force-push, never rewrite history, never push other branches.
- **Write in worktrees (owner, 2026-11-16):** every edit or generated file destined for the repo is made in a `git worktree`, never in the main checkout; main is only for merging, pushing and read-only checks.
- **Scratch/temp (owner, 2026-11-16: avoid claudetmp, use worktrees):** work files, plans, progress logs and generated candidates go in the agent's own worktree under the gitignored `.scratch/`; `~/claudetmp/` only for what must outlive a worktree (shared venvs, the merge script); never `/tmp/`.
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
- **Small agents (owner, 2026-11-18):** one narrow question per agent (about 12 files, about 20 tool calls); planners write their plan incrementally to the worktree `.scratch/`; fan big topics out into many parallel planners and merge their answers into one ranked plan before any build. An agent whose output (`stat -L`) is quiet for 15 minutes is stopped and relaunched split up.
- **Agents:** keep 2-5 running continuously (refill the pool as each finishes) on independent ideas (owner, 2026-11-12: more parallel agents; reviewer agents do first-pass review), each in its own `git worktree` with its own `E2E_PORT`/dev port; Sonnet by default,
  Opus only for risky new sim systems or hard merges. Never two agents on the same shared file (`tools/ci/size-budget.json`,
  `src/core/index.ts`, `docs/REPO-MAP.md`, the asset manifest). The coordinator reviews and merges each result, gate first.
  Agents run browsers only via `pnpm e2e:smoke` and `pnpm e2e -- <touched specs>`; the router alone picks PC or Mac. They never force a Mac run (`e2e:local`, `--local`, `TTE_E2E_LOCAL=1`, `CI=1`, `TTE_ALLOW_MAC_E2E`), never rerun a red result on the other machine, copy the `e2e ran on:` line into the report, and report exits 89/94/95/96 instead of working around them.
- **Heavy jobs:** where a job runs is data in `tools/ci/offload-routes.json` (short e2e PC first with Mac fallback; full e2e/flake PC only; SDXL base and sd-turbo on the PC via `gpu-queue.py`; SDXL-Turbo 4-step and img2img on the Mac one at a time under load 10; visual, soak, unit gate and golden recording on the Mac). Check `pnpm pc:probe` before starting heavy work.
- **GPU PC (4060) etiquette (owner, 2026-11-18, permanent):** keep an art job on it most of the day and give it extra volume 23:00-07:00 (cheap power). One GPU job at a time; never kill another session's job; watch temperature (pause at 80 C, abort above 83 C), free RAM (abort under 4 GB), disk and WSL; leave no stray processes; no host, IP, user or key in the repo. `tools/assets/roster24-art/gpu-queue.py` enforces the guards; art output still needs the owner's contact-sheet approval.
- **GPU PC job server:** reach the PC for GPU or heavy-CPU jobs only through `pnpm gpu:submit|status|list|cancel|log|fetch|wait` (setup once: `pnpm gpu:setup`); no hand-made ssh/pueue/`gpu-queue.py` runs. Rules and exit codes: [.claude/rules/gpu-pc.md](.claude/rules/gpu-pc.md); code in `tools/gpu-queue/`.
- **Autonomy:** the owner pre-approved design, art and balance changes ("autoapprove all changes"); do not pause for approval, report afterwards.
  Still confirm before irreversible or outward-facing steps (force-push, history rewrite, deleting the legacy tag, credentials, deleting Classic sim code).
- **Plan then build (owner, 2026-11-14):** before EACH idea, plan it with an Opus agent at max effort (`model: opus`, `effort: max`; a written plan: files, tests, risks, sim/golden impact), then implement it with a Sonnet agent from that plan. Applies to every idea, including self-generated ones; the Opus planner only plans, it does not edit.
- **Ideas:** every idea or todo, including self-generated ones, is a file in [ideas/](ideas/README.md) (brainstorm/in-progress/done). No cap; never add limits the owner did not ask for.
- **Player-facing words:** the menu is Play, Versus, Online, Settings, Help; never show the words Classic, Arcade, ruleset or Capture to players (Snag replaces Capture).
- **Visual work:** check it with real-game screenshots (Playwright, see the play-local skill) before calling it done; art must match Fiara's rigged and baked look.
