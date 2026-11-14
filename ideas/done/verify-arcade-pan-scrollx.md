---
status: done
added: 2026-11-14
---

# e2e: arcade-pan.spec.ts fails on main (scrollX is -320, expected 0)

Found by the e2e sweep at main 8c969b3f. Repeated in both `pnpm e2e` runs (2/2), so it is real, not flaky.

- `tests/e2e/arcade-pan.spec.ts:67` Arcade: close fighters at each wall pin the view to that wall (`left.scrollX` Received -320, expected >= -0.5)
- `tests/e2e/arcade-pan.spec.ts:98` Classic: the camera never pans or zooms (`scrollX` -320, expected 0)
- `tests/e2e/arcade-pan.spec.ts:118` Arcade: the action bar stays fixed while the camera pans (`home.scrollX` -320, expected 0)

A constant -320 offset suggests the camera scroll origin changed (centred/letterboxed world, or a wider arena) and the spec's WORLD/VIEW assumptions are stale, or the camera now over-scrolls past the left wall. Decide which is intended, then fix the code or the spec.

Repro: `E2E_PORT=79xx pnpm e2e tests/e2e/arcade-pan.spec.ts`. Logs: `~/claudetmp/e2e-run1.log`, `e2e-run2.log`.

Fixed 2026-11-14 (4fc81e93): test hook now returns worldView.x; spec uses real fighter widths. Not a game regression.
