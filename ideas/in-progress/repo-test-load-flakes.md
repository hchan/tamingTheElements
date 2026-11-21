---
status: in-progress
added: 2026-11-20
---

# Repo test flakes under machine load (e2e-server case E, browser-slot stray lock)

Two tests in `tests/repo` failed once each in `gate:commit` at load 10-30 and passed on rerun.

## e2e-server.test.ts case E ("a port that stays taken is reported (holder named)")

Reproduced on demand with 8 `yes > /dev/null` loops (1 failure in 3 runs of the two files): the log had `port in use` and `gave up`, but no
`pid <vitest pid>` line. Root cause is in the code, not the ports (both ports are OS-assigned, the holder is in-process). `portHolders()` in
`tools/ci/e2e-server.ts` ran `lsof` (which walks every process) through `tryRun` with a fixed 2 s timeout. At load 20+ it takes longer, the
timeout swallows it, the log says "holder unknown", and the assertion on the holder pid fails. The 2 s gaps between the log lines confirm the timeout.
Fix: timeout raised to 20 s. The lookup runs only after a failed preview start, so a healthy run is unaffected.

## browser-slot.test.ts (stray browser-slot-1 lock)

Not reproduced (24 CPU hogs, 4 runs, all green); the SIGTERM case was already polled for release (e2e-robust). The remaining
structural race: the tests spawned `tools/ci/browser-slot.ts` through the tsx CLI, a launcher process that spawns the real process and relays
signals. `close` of the launcher is not the exit of the real process, and the real process runs at nice 19, so under load the lock release can
come seconds after the launcher is gone; a failing test could also leave the real process (and its lock) running. Fix: spawn with
`node --import tsx` so the pid signalled is the pid that releases (its exit means the locks are gone), a 20 s release poll as a backstop,
and an `afterEach` that kills any spawned slot process still alive.

Prove: `.scratch/stress.sh` style loop, 10 plain runs and 6 runs under 12 CPU loops, both test files.
