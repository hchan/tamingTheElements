# Claude Code setup

What lives in `.claude/` and how to use it. `tests/repo/claude-setup.test.ts` pins the frontmatter of every agent and skill
and checks that each `pnpm` script and repo path they mention exists, so this setup cannot drift from the repo.

## Settings and hooks

`.claude/settings.json` allows every Bash command, denies reading `war/WEB-INF/user.properties` (the old credentials file, now only in git history and the legacy tag) and `.env*` files, and denies
`rm -rf /*` and piping curl into a shell. Hooks:

| Hook | Event | Behaviour |
|---|---|---|
| `.claude/hooks/pre-push-local-ci.sh` | `PreToolUse` on Bash | Before a `git push`, runs lint, typecheck, depcruise and test; a failure blocks the push. It fails open when pnpm is missing. Commits are never touched. |
| `.claude/hooks/session-start-handoff.sh` | `SessionStart` | Prints the newest `~/claudetmp/handoff/*.md` (written by `/handoff`). |

Commits and pushes still happen only when the user asks (see `CLAUDE.md`).

## Agents (`.claude/agents/`)

Reviewers are read-only (tools: Read, Grep, Glob, Bash) and end with a severity-graded report (Blocker, Major, Minor, Nit) and a
verdict. Judgment-heavy agents use `opus`, mechanical ones `sonnet`.

| Agent | Model | Use for |
|---|---|---|
| `code-reviewer` | see file | TypeScript, config and script changes |
| `determinism-reviewer` | opus | `src/core` against `docs/DETERMINISM.md` |
| `docs-reviewer` | see file | Markdown and `.claude` files |
| `phaser-code-reviewer` | opus | `src/game`, `src/ui`, tooling and CI |
| `test-reviewer` | sonnet | Tests, flakiness, `it.fails` discipline, coverage |
| `netcode-reviewer` | opus | Net, rollback and replay code (reviews `src/core/net` once it exists) |
| `perf-budget-reviewer` | sonnet | Bundle size, per-tick allocation, asset weight |
| `a11y-ux-reviewer` | opus | Menus, keyboard, contrast, touch, viewport |
| `asset-pipeline-reviewer` | sonnet | `tools/assets`, `public/assets`, manifest |
| `parity-verifier` | opus | `docs/PARITY.md` rows against their tests |
| `gameplay-balance-analyst` | sonnet | `pnpm sim:match` and `pnpm balance:compare` deltas |
| `repo-score` | opus | 0-5 score per category from commands actually run |
| `wp-implementer` | see file | Implements one work package (writes files; never commits) |

## Skills (`.claude/skills/<name>/SKILL.md`)

Invoke with `/<name>`. Skills marked user-only set `disable-model-invocation: true`.

| Skill | What it does |
|---|---|
| `/sim-run` | Headless matches with `pnpm sim:match` |
| `/balance-report` | `pnpm balance:compare` against `tests/fixtures/balance/baseline.json`; never re-records |
| `/replay` | Verifies the golden replay (and browsers with `pnpm test:browser`) |
| `/e2e-test` | Playwright specs in `tests/e2e` |
| `/parity-check` | Checks `docs/PARITY.md` against cited tests |
| `/add-character`, `/add-ability` | Guided additions to the sim data; need design approval; user-only for add-character |
| `/mermaid` | Rendering rules for diagrams in docs |
| `/handoff` | Writes a session note to `~/claudetmp/handoff/` |
| `/status` | Git, CI and open items |
| `/full-review` | Parallel code, determinism and docs reviewers over the diff |
| `/repo-score` | Read-only health score |
| `/plan-and-save-to-tmp-location`, `/do-work-from-plan` | Plan, then execute a work package in a worktree |

## Workflow

`.claude/workflows/full-review.js` runs the domain reviewers in parallel over the diff against a base ref (default `main`;
args `base` and `only`), then one adversarial verifier per finding, and returns confirmed and refuted findings sorted by
severity. A workflow has no filesystem access; the caller reports the result. The test wraps the script in an async function
and compiles it to prove it parses.

## Adding an agent or skill

Create the file, give it the required frontmatter (`name` equal to the file or folder name, `description` saying when to use
it and what it is NOT for, `tools` and `model` for agents), mention only commands and paths that exist, then run
`corepack pnpm exec vitest run --project repo tests/repo/claude-setup.test.ts` and add a row above.
