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

## Coverage audit (2026-11-12)

No coverage provider is installed (`@vitest/coverage-*` is absent), so this audit is by name: every exported symbol of every `src` file with no
sibling or same-name test was grepped across all `*.test.ts`/`*.spec.ts`. Most of the codebase is already referenced by a test (menus, settings
persistence, pause dialog, round flow and HUD, input remapping and replays all have unit plus e2e specs); the real holes were small pure units:

- Added unit tests: `src/core/net/packet.test.ts` (wire layout, caps, malformed datagrams never throw), `src/game/input/key-map.test.ts` (`reduceKey`:
  held set, blur, Shift-P / Ctrl-M once per press, tester cheats gated), `src/game/hud/screen-box.test.ts` (camera zoom and scroll to the screen box),
  `src/core/save/migrations/v0-to-v1.test.ts` (string numbers, whitelists, member cleanup, savedAt, no mutation) and
  `src/core/sim/systems/end.test.ts` (Classic `survivorsOf` / `matchWinner` / `endSystem`: bench keeps a team alive, draw, emit once).
- Second pass: `src/core/agents/scripted-ai/arcade-match.test.ts` (whole-match properties of the Arcade AI: same seed same command stream, no command the observation refuses, every button used so the checks are not vacuous, a mid-match save/load resumes the identical stream; no illegal command found, so no bug recorded), `src/game/fx/super-view.test.ts` (`superName`) and `src/game/fx/terrain-stage-frames.test.ts` (`farFrame`/`crowdFrame`/`flyFrame` names match `atlasFrames`, all inside the atlas). The pure helpers of `arcade-ai.ts` were already covered by `arcade.test.ts`, `arcade-trap.test.ts` and `step-apart.test.ts`; `grim-fx.test.ts` already covers `mute`/`hash01`; the other `*-view.ts` files hold no pure logic (it lives in tested companions).
- Remaining, weakest first: `src/game/scenes/Arena.ts` (832 lines) and `Hud.ts` (513) only through e2e, no unit seam; `ability-aura-view`, `trap-view`, `danger-view` and `views/backdrop.ts` render-only (screenshot specs); `src/game/hud/bars.ts` unreferenced constants (`BAR_LINE`, `REST_COLOR`, `collectSide`); `terrainRound`/`terrainTick` covered only indirectly by `terrain.test.ts`; `game/boot/phaser-config.ts`.
- To get numbers: add `@vitest/coverage-v8` and run `vitest run --coverage` (needs an owner decision on a new devDependency).
- New test files need no REPO-MAP entry (REPO-MAP lists directories, not test files).
