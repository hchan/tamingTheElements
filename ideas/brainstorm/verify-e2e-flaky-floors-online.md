---
status: idea
added: 2026-11-14
---

# e2e: two specs failed once in the sweep and passed on the retry run

At main 8c969b3f, `pnpm e2e` run 1 failed, run 2 passed (1 of 2 runs each):

- `tests/e2e/arcade-stage-floors.spec.ts:12` Arcade air stage draws its tile floor, patches and trap pads: `expect(traps).toBe(1)` got 0 (14.8s). Possibly the trap pad is not drawn yet when sampled; wait on a settled signal.
- `tests/e2e/online-match.spec.ts:58` two browser contexts play a whole online match to the same result (arcade,rollback,netbot).

CLAUDE.md wants several clean runs in a row, so treat both as flaky until shown otherwise. Log: `~/claudetmp/e2e-run1.log`.
