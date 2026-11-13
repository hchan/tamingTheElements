---
status: done
---
# World Tour splash: the svg-count assertion can still race

The versus splash auto-advances after 1.2 s (`SPLASH_MS` in `src/game/app/tour.ts`). The splash-flake fix (tapTourSplash in tests/e2e/parity/helpers.ts) removed the tap race, but `expect(page.locator('#tourSplash svg')).toHaveCount(2)` before the Enter skip in tests/e2e/tour.spec.ts can still miss if the page stalls for over 1.2 s under load.

Fix needs a source change: a test-only hold (e.g. a `?ff=` flag or `__TTE__` hook that pauses the splash timer) so the specs can assert the splash deterministically instead of racing the timer.

## Done (2026-11-13)

`?ff=holdSplash` (dev and test builds only, `UiFlags.holdSplash`) makes `showSplash` in `src/game/app/tour.ts` skip its 1.2 s timer, so the splash waits for Enter, Space or a click. `tests/e2e/tour.spec.ts` ("the versus splash is skipped by Enter and by a click") uses `&ff=arcade,holdSplash`; the auto-advance and reduced-motion specs keep the timer. Unit tests: `flags.test.ts` and `tour.dom.test.ts` (no timer, still up after 60 s, Enter skips).
