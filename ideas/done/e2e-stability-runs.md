---
status: done
added: 2026-11-12
---

# E2E must pass several runs in a row

Run 11 passed 169/169 on 2026-11-12. Keep the habit: after HUD or art changes, rerun on a fresh port until several runs in a row pass; record flaky tests in e2e-coverage-and-browsers.

## Resolution (2026-11-14)

Status: done. The tooling already existed (`pnpm e2e:flake --repeat N`, docs/TESTING.md "Finding flakes"). Ran the whole suite 3x in a row
with `E2E_PORT=7970 pnpm e2e:flake --repeat 3` (retries off) on a worktree of main at c92d6004, while the machine was at load average ~28 from other agents:
347 tests, every one 3/3 (0 failures, 0 flaky). No flaky tests found, so nothing to record in e2e-coverage-and-browsers.
Habit stays: rerun `e2e:flake` after HUD or art changes (a full 3x pass takes roughly 2 h under that load).
