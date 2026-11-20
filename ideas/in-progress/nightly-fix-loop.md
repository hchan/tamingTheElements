---
status: in-progress
added: 2026-11-20
---

# Nightly fix loop (run, review, fix, retest, push)

Owner request 2026-11-20: the nightly full e2e on the PC should not only report; it should review the errors, fix, retest, loop, and push to origin when good.

Built: `tools/ci/nightly-fix.ts` (I/O) and `tools/ci/nightly-fix-logic.ts` (pure, tested in `tests/repo/nightly-fix.test.ts`). `pnpm nightly:fix [--dry-run]` and `pnpm nightly:collect-and-fix` (what the 06:00 LaunchAgent now runs).

Flow (hardened after review 2026-11-20, see docs/TESTING.md): fresh collected red status for a sha not yet handled, at most 3 failures -> fresh worktree from origin/main -> per failure up to 3 rounds of sandboxed headless `claude -p` (no user/project settings, file tools only, no Bash, budget cap, clean env, pushes disabled, process-group timeout) -> re-run only that spec via the router with `--pc` (never the Mac; 89/94/95/96, signals and timeouts stop the loop) -> fixed (commit), flaky (report only; known-red acks stay with the coordinator), needs-human. The diff against the base is checked in code (forbidden: src/core, tests/fixtures, tests/repo, all of tools/, lint/ts/playwright/vitest config, size-budget, REPO-MAP, manifest, package.json, lockfile, .claude, .github, credentials; and added skip/fixme/only/test.fail/retries). Caps: 4 h and 22:00, one run at a time (lock). Push only after: merge --no-ff in a second worktree, clean marker grep, spec re-run green, gate:push, origin/main unmoved; plain git push origin HEAD:main, never forced.

Report: `<git common dir>/tte-gate/nightly-fix-status.json` and `nightly-fix-report.md`; `pnpm nightly:status` prints it. States `fixed-pushed`, `needs-human`, `red-unfixed`.

Install (owner runs it; not run by the agent): `corepack pnpm nightly:install` (preview with `--dry-run`).

Progress note / not verified live: the real `claude -p` flags (`--setting-sources`, `--tools`, `--safe-mode`, `--max-budget-usd`, `--permission-mode acceptEdits`), group-run.ts with real children, the PC re-run JSON copy for `run --pc`, the `pnpm install` in a fresh worktree, the PC re-run and the push path have only run against fakes. First real night: run `pnpm nightly:fix --dry-run` first, then watch `nightly.log`.

Also fixed: `unrecordedFailures` matched `tests/e2e/x.spec.ts` (known-red.json) against Playwright's `x.spec.ts` with `===`, so a known-red entry never matched; it now accepts either form.
