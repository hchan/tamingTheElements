---
status: idea
added: 2026-11-17
---

# Triage: the 16 e2e failures on the 4060 PC

Follow-up to [gpu-vs-mac-bakeoff](gpu-vs-mac-bakeoff.md) ("Full e2e on the PC"). Method: `tools/dev/remote-run.sh` on origin/main `53608d0b`, 1 worker, nothing else on the PC (load 0.3). Run 1: the nine failing specs once (18 failed, 55 passed, 22.7 min). Run 2: the failing tests with `--repeat-each=2`. Runs 3 to 6: diagnostic specs (scratch, not committed). No Mac browser run (Mac load was 25 to 70 throughout, over the limit of 12), so nothing below is Mac-verified.

## Root cause (found)

On the PC, `requestAnimationFrame` never fires and `page.screenshot` times out, even on a blank `page.setContent('<p>hi</p>')` page. Measured: 0 rAF callbacks in 1.5 to 3 s, `document.visibilityState === 'visible'`, `hasFocus() === true`. It holds for every launch variant tried (the project's SwiftShader args, no args, `--disable-gpu`, `--disable-renderer-backgrounding` and friends, `--run-all-compositor-stages-before-draw`, `channel: 'chromium'` new headless, `--no-sandbox`); `--in-process-gpu` made it worse (31 s). Chromium 158.0.8127.18, WSL Ubuntu, fresh WSL VM per ssh session (`up` about 2 minutes at each start).

Consequences that match every failure message:

- Playwright's actionability check "element is stable" needs two animation frames, so `click`/`tap` hang with `waiting for element to be visible, enabled and stable` until the 30 s action timeout.
- ResizeObserver callbacks and layout-driven code run in the rendering step, so `markMoreBelow` (`src/ui/dom.ts`) never sets `data-more`, and the touch bar never settles its width.
- `page.screenshot` waits for a frame and times out.

It is intermittent: run 1 passed 55 tests that need frames, and the same tests then failed in later runs and in the same run after some point (portrait-play passed its first test per viewport, then every later Fight click hung). So the PC's headless compositor is in a "no frames" state some of the time; why it flips was not found (candidates: WSL2 or Windows session state such as locked or display-off, WSLg, GPU driver; not load, not memory, not leftover browsers: `pgrep chrom` was 0).

## Table

Class: (a) real bug that also fails on the Mac, (b) PC/WSL environment artefact, (c) flaky or load-sensitive test. "Frames off" = the root cause above.

| Test | Class | Evidence | Proposed fix |
|---|---|---|---|
| hud-polish-r77 568x320 hit counter | b | Fails in run 1 and both reps with `page.screenshot` timeout (the spec itself notes "rAF does not fire reliably on the mobile profile"). | None to the test. Needs a Mac run to confirm green. |
| hud-polish-r77 1280x720 and 844x390 `no WEATHER`, `WINS gap` (3 more in run 1, not in the original 16) | b | Always the first three tests of a run: `Fight` click hangs on "stable" for 30 s; the identical tests pass in 2 s once the run is warm (rep 2 passed). | None; PC preflight (below). |
| hud-text-clear 390x844 and 360x640 | b/c | Passed in run 1 (all 6 tests green, 7 to 32 s), failed in the bakeoff run. Not reproducible, so load/frames. | None. |
| manual-fx-age white damage pop | b | Fails 3 of 3 (run 1 and both reps): the `expect.poll` for `pops + rings === 0` after `ageFx(true)` stays at 1 for 5 s. `ageFx` ages effects on real frames, which do not come. | None; confirm on Mac. |
| picker-bar Versus 2v2, three tests | b | Fails 3 of 3. Test 1: 2v2 radio click hangs on "stable". Tests 2 and 3: `.pickScroll` never gets `data-more` (diag: `scrollHeight 530 == clientHeight 530` on the PC at 1280x720, and ResizeObserver does not run without frames). The six non-2v2 tests in the file pass because they only read rects. | None. Mac run needed: if the Mac shows overflow at 1280x720 with the same content, this is purely frames. |
| playtest-replay record, download, verify | b | Fails 3 of 3 in `skipCinematic` (`waitForFunction(CINEMATIC_READY)` 30 s, no frames); the other two tests in the file pass (the tampered-replay one failed in the bakeoff run but passed in run 1). | None. |
| portrait-play melee nine-tile bar (both viewports) | b/c | Failed 4 of 5 with `arcadeCleanse width 43.27 / 39.94 < 43.4`: the check reads `CONTROLS` once, but the bar re-lays out a frame or two after the buttons appear (the spec comment in `expectBalancedRows` says so), so a slow or absent frame reads a transitional width. Passed once (390x844 rep 1). | Real small test weakness even on the Mac under load: poll the width and height checks (`expect.poll`) the way `expectBalancedRows` already does. Not applied; see below. |
| portrait-play 3v3 Tag buttons | b/c | Passed in run 1 at both viewports (bakeoff failure not reproduced). Same single-read pattern as melee. | Same poll fix. |
| portrait-play HUD name sindarosa (not in the original 16) | b | Fails 5 of 6, Fight tap hangs on "stable". | None. |
| online-match (netbot,lockstep variant) | b/c | Failed in run 1 (`Host a game` click hangs on "stable"), the other variants passed (1.7 m). | None; two-context specs are the first to lose frames. |
| online-relay (two tests) | b/c | Run 1 failed both; run 2 rep 1 passed one (22 s), rep 2 failed both. Failure points are `summary` click ("stable") and the status text after Join (rendering-dependent). | None. |
| online-leave (two tests) | b/c | Failed in run 1, passed in run 2 rep 1, failed in rep 2. Same "stable" hang on `#onlineRoleHost`. | None. |

Summary: 0 failures shown to be class (a); none reproduce a game bug. Every failure is a symptom of "no frames" on the PC (class b) or a timing-fragile read that only a slow frame exposes (the portrait-play width check, class c).

## Proposed follow-ups

1. Preflight in `tools/dev/remote-run.sh` (or the doc): before an e2e command, run a 3-line Playwright check that a blank page gets at least 10 rAF callbacks and that a screenshot completes in 5 s; abort with "PC compositor is not producing frames" otherwise. That turns 20 minutes of misleading red into a 10 s refusal.
2. Find why the compositor stalls (compare `chrome://gpu` output via `--enable-logging`, Windows session lock/sleep, WSLg on/off, `wsl --update`, Playwright browser reinstall `pnpm exec playwright install chromium`). Until fixed the PC is a unit/sim/build machine, not an e2e machine; the bakeoff routing already says "not gate-equivalent".
3. Run these nine specs on the Mac when its load is under 12 (one spec at a time) to close the (a) question formally; expected all green.
4. Small test hardening (long gate, no new tests, so no `@smoke` change): portrait-play `CONTROLS` width/height loops at lines 358 to 361 (melee) and the 3v3 loop should poll like `expectBalancedRows`. Not applied here because it cannot be verified without frames on the PC and the Mac is overloaded.
