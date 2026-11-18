---
status: in-progress
added: 2026-11-18
---

# Run the e2e suite on the GPU PC

Run the Playwright e2e suite on the GPU PC (RTX 4060, WSL2) instead of the Mac. `pnpm e2e` goes through `tools/ci/e2e-route.ts`; when
`git config tte.remote` is set the router sends the run to the PC, otherwise it runs locally. The Mac keeps its CPU, battery and fans for
editing and agents, and the PC has the headroom for several runs in a row. Connection details are never recorded in the repo.

## Design (summary)

The whole suite runs on the PC: the repo snapshot, the dev/test server, Playwright and the browsers all live there. The Mac only
snapshots the worktree, ships it, starts the job and reads results back. Lane locks on the PC stop two agents from sharing a port or a
browser profile.

## Status

Merged: R1 snapshot and job renderer, R2 ssh transport, R3 router (`e2e:remote`, `e2e:local`), R4 pc-setup plus lane locks, WP2 `@smoke`
tags (15 core-path tests, set size pinned by a test). Smoke on the PC: 15/15 passed in 1m48s.

## Remaining

- Stage-1 checks: the 9 triage specs x3, 5 smoke runs in a row, one full run for timing.
- Flip `tte.remote` on for the main checkout and agent worktrees.
- R6 adoption: CLAUDE.md, docs/TESTING.md, the e2e-test skill, the wp-implementer agent, and a hook that blocks Mac e2e unless
  `TTE_ALLOW_MAC_E2E=1`.
- R5 verification nights: repeated full runs on the PC to prove it is as stable as the Mac.
- Tune `FULL_WORKERS` (parallel workers for the full run) from the timing data.

Alternative considered: [pc-remote-browser](../brainstorm/pc-remote-browser.md).
