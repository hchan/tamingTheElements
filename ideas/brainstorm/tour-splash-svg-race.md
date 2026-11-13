---
status: idea
---
# World Tour splash: the svg-count assertion can still race

The versus splash auto-advances after 1.2 s (`SPLASH_MS` in `src/game/app/tour.ts`). The splash-flake fix (tapTourSplash in tests/e2e/parity/helpers.ts) removed the tap race, but `expect(page.locator('#tourSplash svg')).toHaveCount(2)` before the Enter skip in tests/e2e/tour.spec.ts can still miss if the page stalls for over 1.2 s under load.

Fix needs a source change: a test-only hold (e.g. a `?ff=` flag or `__TTE__` hook that pauses the splash timer) so the specs can assert the splash deterministically instead of racing the timer.
