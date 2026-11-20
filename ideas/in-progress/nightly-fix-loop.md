---
status: in-progress
added: 2026-11-20
---

# Nightly fix loop (run, review, fix, retest, push)

Owner request 2026-11-20: the nightly full e2e on the PC should not only report; it should review the errors, fix, retest, loop, and push to origin when good.

Built: `tools/ci/nightly-fix.ts` (I/O) and `tools/ci/nightly-fix-logic.ts` (pure, tested in `tests/repo/nightly-fix.test.ts`). `pnpm nightly:fix [--dry-run]` and `pnpm nightly:collect-and-fix` (what the 06:00 LaunchAgent now runs).

Flow: red status with unrecorded failures -> fresh worktree from origin/main (`.scratch/nightly-fix-wt`) -> per failure up to 3 rounds of headless `claude -p` (tool allowlist, 25 min cap) -> re-run only that spec via the router with `--pc` (never the Mac; exits 89/94/95/96 stop and are reported) -> fixed (commit), flaky (green with no diff: known-red entry plus an idea file), needs-human. The diff is checked in code against the forbidden list (src/core incl. SIM_VERSION, tests/fixtures, size-budget, REPO-MAP, asset manifest, package.json and lockfile, .claude, .github, tools/ci/nightly-*, credentials). Push only after: merge --no-ff in a second worktree ("Merge <what> (nightly-fix)"), clean marker grep, `gate:push`, spec re-run green, origin/main unmoved; plain `git push origin HEAD:main`, never forced.

Report: `<git common dir>/tte-gate/nightly-fix-status.json` and `nightly-fix-report.md`; `pnpm nightly:status` prints it. States `fixed-pushed`, `needs-human`, `red-unfixed`.

Install (owner runs it; not run by the agent): `corepack pnpm nightly:install` (preview with `--dry-run`).

Progress note / not verified live: the real `claude -p` flags (`--allowedTools`, `--disallowedTools`, `--permission-mode acceptEdits`, `--max-turns`), the `pnpm install` in a fresh worktree, the PC re-run and the push path have only run against fakes. First real night: run `pnpm nightly:fix --dry-run` first, then watch `nightly.log`.

Also fixed: `unrecordedFailures` matched `tests/e2e/x.spec.ts` (known-red.json) against Playwright's `x.spec.ts` with `===`, so a known-red entry never matched; it now accepts either form.
