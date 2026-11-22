# e2e:flake --summary-json fails after a clean run

status: done
added: 2026-11-22

Seen: `pnpm e2e:flake --repeat 10 --summary-json <file> <4 specs>` on the PC (job 20261122-054426-full-533202): 220 passed, 0 failed (84 min), then tools/ci/e2e-flake.ts:133 threw "no JSON report produced (build or config error above)" and the command exited 1, so no summary JSON was written and the ledger merge had nothing to read. Likely the router's flake lane does not copy the Playwright JSON report back (or the reporter is not enabled with a custom spec list). Fix: make the flake lane return the report, or build the table from results.json in the job folder.

Result of the stress itself: playtest-replay, replay-input-display, online-result, idle-aura x10 each, 220/220 passed. No flake reproduced.

Resolution (2026-11-22): root cause on the PC not observable after the fact; the report file was missing or unparseable and the catch hid why. tools/ci/e2e-flake.ts now resolves the report path to an absolute one (Playwright resolves a relative PLAYWRIGHT_JSON_OUTPUT_NAME against the config dir), falls back to the JSON the reporter wrote to stdout (`loadReport`), and on failure reports the read error, spawn error, exit status and signal. Tests: tests/repo/ci-tools.test.ts "e2e:flake report loading". If it recurs, the new message names the cause.
