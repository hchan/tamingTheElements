---
status: idea
added: 2026-11-18
---

# Make the e2e suite lighter and less timeout-prone

Source: the PC full run `20261118-161408-full-98598e` (677 tests, 670 passed, 7 failed in the log, 126 min; results.json per-test durations; 1 worker). The 7 failures (4 asserts, 3 timeouts): arcade-weather:130, hud-polish-r77 568x320, manual-fx-age, online-relay:51, portrait-play:354 (Curomo 44x44), touch-fight-layout "portrait 2v2" (83 s), weather-particles (`page.screenshot` timeout). The screenshot timeouts match the "no frames" family in [pc-e2e-failure-triage](pc-e2e-failure-triage.md).

## Where the time goes (sum of test durations, 7507 s)

| Spec | s | Why |
|---|---|---|
| hero-portrait-shot | 940 | 14 tests, 300 ticks each, one rAF per tick (SwiftShader), twice (1280 and 1920@dpr2) |
| touch-fight-layout | 549 | 42 tests, a full fight start per viewport/mode |
| online-match | 524 | four tests of 111 to 174 s: two browser contexts play a whole match |
| responsive | 456 | 17 tests across viewports |
| portrait-play | 345 | 20 tests, a fight start each |
| super-band | 272 | two phone tests of 87 to 97 s: two rAFs per tick for 5 casts x 40 ticks |
| callout-pop-lanes 204, ability-fx 173, small-viewport-fight 166, hero-scale 161 (two wall tests of 75 s: 250 iterations x two rAFs), stage-hazards 132, hit-mark-element 119, sprite-sheets 118, move-backward 110, match-end 110, idle-aura 106, online-versus 104 | | |

The top 5 specs are 2800 s, 37% of the run.

## Done in this pass

- hero-portrait-shot: `fight()` runs `every` ticks per rendered frame instead of one (the samples were already every 3rd or 4th tick), about a third of the frames.
- Fixed waits replaced by state waits: portrait-play (300 ms -> two rAFs), move-wings-knees (round intro 1500 ms -> poll on `state().tick`; 250 ms and 60 ms -> tick and rAF waits), effect-sprites-shot (160 ms -> four rAFs).
- tests/repo/browser-slot.test.ts SIGTERM test waits for the locks to be released instead of reading them the moment the launcher exits.

## Left as is, on purpose

- first-run-hint (400 ms) and first-run-hint-portrait (600 ms, 400 ms) waits assert that a card does not appear: a state-based wait cannot prove an absence, so they stay short fixed waits. A cleaner version steps N ticks in manual mode and asserts, with no wall-clock wait at all (needs the card reveal to be tick-driven, it is partly real-time).

## Ideas not done

1. Share the fight start: touch-fight-layout, portrait-play, responsive and small-viewport-fight each navigate, pick, and press Fight per test. A worker-scoped fixture that boots once per viewport and `loadSave`/resets between tests would cut about 15 s of startup per test, but ties tests together (a failure poisons the next); try it for the read-only layout specs only.
2. online-match: four whole matches at 111 to 174 s. Cap the match at fewer rounds or ticks with a seed that ends fast, keep one full-length match.
3. hero-portrait-shot: the 1920x1080@2 copy exists for screenshots (SHOT_DIR); the assertions are viewport independent. Run the 1920 copy only when SHOT_DIR is set, or on one pair.
4. super-band and hero-scale: one rAF per tick where the probe reads sim state, not drawn pixels (needs a check that `superFx()` is never a frame behind).
5. Tag the heavy specs `@slow` and keep them out of the default short runs; `pnpm e2e:smoke` already has `@smoke`.
6. Screenshots to `~/claudetmp` (weather-particles writes `${HOME}/claudetmp/...`) time out when frames stall; use `testInfo.outputPath` and skip when no frame arrives.
7. Timeouts under load: tests that are over 60 s at the median (hero-portrait-shot 67 s average, online-match) rely on `test.slow()`/`setTimeout`; a PC run at load 2 or more pushes them past the budget. Shrinking them (above) beats raising timeouts.
8. Per-spec timing report: add a small script that turns `results.json` into the table above (the one used here lives in the report, not the repo).

## Exit 93 on a PC `pnpm e2e:smoke` (job lost)

Run `20261118-170005-short-361290` (`.scratch/pc-smoke-r5.log`): the job had no `health.csv` and an empty `output.log`, so `job.sh` died before it started its sampler, and `ctl.sh follow` declared it lost after the job pid was gone for 4 polls (1.2 s). 93 is shared with the memory guard (`killed-mem`), but that writes a final status first and this one did not. Most likely cause: the WSL VM was recycled between the ssh sessions (the PC runs a fresh WSL VM per ssh session; the foreground warning "WSL instance is young (idle timeout not off?)" appears in other runs), taking the detached job with it. Not test-side; it is the known WSL instance lifetime quirk. Mitigation already in place: young instances run in the foreground of the ssh session. A retry rule is in `pc-decide.ts` (`93` without stage `memory` runs again). Not reproduced here.

## browser-slot SIGTERM flake

`tests/repo/browser-slot.test.ts` "forwards SIGTERM to the child and releases its locks" spawned `tsx/dist/cli.mjs`, which spawns the real process and relays signals. The test resolved on the launcher's `close` and read the lock directory once; at low load the launcher can exit a moment before the inner process has released the locks (`finally { releaseAll() }` after the child's `close`). Fixed test-side by polling for the release (10 s cap). Not reproduced in 3+ runs, so the cause is inferred from the code, not observed.
