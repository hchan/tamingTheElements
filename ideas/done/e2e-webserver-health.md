---
status: done
added: 2026-11-17
---

# E2E webServer health: a dead preview must not cascade into hundreds of failures

## Finding
A full `pnpm e2e` pass once failed 318 tests with `ERR_CONNECTION_REFUSED`: the `vite preview` process started by Playwright's `webServer` died mid-run, cause unknown (candidates: OOM or sleep/kill on a loaded machine, a stray `pkill`, or a port clash). Playwright only checks the URL at startup; `reuseExistingServer: !CI` and `timeout: 120_000` apply to that start, not to later life. Nothing logged the exit, so the cause was lost, and every later test failed fast.

## What was found (2026-11-18)
- Playwright's group kill hit `corepack pnpm`, not vite: the old supervisor spawned vite through pnpm, so signals and orphans went to the wrong process.
- A symlinked `node_modules` made every worktree share `node_modules/.tte-e2e`; one checkout's `--emptyOutDir` build wiped the build another preview was serving, and vite's preview crashes with ENOENT then.
- A killed runner left the supervisor and vite running as orphans holding the port.
- The old probe killed after 3 failures of 5 s, which a starved machine can produce, and never drained response bodies.

## What changed
- `tools/ci/e2e-server.ts` spawns vite directly, stops on SIGTERM/SIGINT/SIGHUP or parent stdin close, restarts with backoff and gives up with a log line.
- Per-checkout build in `<git-dir>/tte-e2e-build` (`e2eBuildDir` in `tools/ci/e2e-port.ts`).
- Pure policy in `tools/ci/e2e-server-policy.ts` (restart, exit reading, stderr class, probe tracker), unit-tested; process tests run the real supervisor against `tests/repo/fixtures/fake-vite.cjs`.
- `e2e:pages` runs through the same supervisor; the router prints server trouble lines after a failed run; `e2e-server.log` is fetched from the PC.
- Docs: "Preview server health" in `docs/TESTING.md`.

## Not covered
- A test running inside a restart window still fails (see the follow-up ideas for a connection-holding front).
- If the supervisor itself is SIGKILLed nothing restarts it; the log then ends at the last line.
