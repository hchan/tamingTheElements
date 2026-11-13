---
status: in-progress
added: 2026-11-12
---

# E2E breadth and cross-browser

Keep `pnpm e2e` (169 tests) green several runs in a row; add tests for each new feature; run goldens in Chromium, Firefox and WebKit; e2e:pages after deploy; e2e:itch.

## Progress (2026-11-12)

- Done: `tests/browser/determinism.browser.test.ts` now globs every `tests/fixtures/replays/*.replay.json` (so a new golden cannot be left out),
  asserts each is at the current `SIM_VERSION` (40) and verifies its hash chain, names the nine expected goldens (Classic 1v1, Classic 2v2 ch3,
  Arcade 1v1 and the six scripted Arcade goldens), and re-records the 2v2 ch3 match fresh in-browser and compares it byte for byte.
  `random-2v2-ch3` was previously only checked in Node.
- Verified here: Chromium 12/12 and WebKit 12/12 pass. Firefox (Playwright build 1572, Firefox 159) will not launch on this macOS host
  ("Could not find profile folder", also with the sandbox off and a custom TMPDIR), so Firefox is unverified locally; CI runs it.
- Still open: Firefox run on a host where it launches, e2e breadth per new feature, `e2e:pages` after deploy, `e2e:itch`.
- Re-checked 2026-11-12 (macOS 27.2, Playwright 1.65, Firefox 159 build 1572, WebKit 2388, all headless): `pnpm test:browser` passes on Chromium and WebKit
  (all golden replays and the in-browser 2v2 ch3 re-record match the Node hashes; no sim divergence seen). Firefox still fails to launch, and not through
  Playwright alone: the binary run by hand (`firefox -no-remote -headless -profile <existing dir>`) prints "Could not find profile folder" and exits 1, with the
  sandbox on or off, so it is a Firefox-159-on-this-OS host problem, not a test-harness or sim one. Nothing to fix in tests/config; the Playwright `e2e`
  config stays Chromium only (the goldens run through the vitest `browser` project, which already lists Firefox). Firefox goldens remain CI-only until a host launches it.
