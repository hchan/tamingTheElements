---
status: idea
added: 2026-11-17
---

# E2E webServer health: a dead preview must not cascade into hundreds of failures

## Finding
A full `pnpm e2e` pass once failed 318 tests with `ERR_CONNECTION_REFUSED`: the `vite preview` process started by Playwright's `webServer` died mid-run, cause unknown (candidates: OOM or sleep/kill on a loaded machine, a stray `pkill`, or a port clash). Playwright only checks the URL at startup; `reuseExistingServer: !CI` and `timeout: 120_000` apply to that start, not to later life. Nothing logged the exit, so the cause was lost, and every later test failed fast.

## Mitigation (done in this change)
`playwright.config.ts` now runs `tools/ci/e2e-server.ts <port>`: it builds the test bundle, then supervises `vite preview`. An unexpected exit is logged (code and signal) to `.scratch/e2e-server.log` and the preview restarts on the same port after 500 ms (max 50 restarts). A probe every 5 s kills and restarts a preview that is alive but unresponsive for 3 probes.

## Not covered / follow-ups
- A test running during the ~1 s restart window still fails; `e2e:flake` can catch that. Retries stay CI-only.
- If the supervisor itself is SIGKILLed (OOM killer) nothing restarts it; the log then shows only the last start. Worth checking `.scratch/e2e-server.log` after any mass failure.
- `playwright.pages.config.ts` and `playwright.itch.config.ts` were not changed.
- Cause still unknown: if the log shows signal=SIGKILL with no probe message, suspect the OS (memory pressure).
