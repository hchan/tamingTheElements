---
status: done
added: 2026-11-12
---

# Sudden death presentation

Follow-up to ideas/in-progress/sf-round-timer-draws.md. The sudden-death round has a banner and a screen-reader line.

Done (2026-11-12): verified in a real game. The dev/test-only tester hook `__TTE__.arena.setRoundsWon(w0, w1)` (Arena.ts, dropped from production builds; the sim and SIM_VERSION are untouched) plus a double KO reaches the 2-2 draw; `tests/e2e/arcade-rounds.spec.ts` asserts the "SUDDEN DEATH" banner, the assertive live line ("Sudden death. One hit may decide the match.") and 10% life, and screenshots it. The screenshot showed the banner fits the 1280 px width once its scale-in (30 ticks) has finished; the life bars already read "10% LOW", and the timer already turns red under 10 s.

Done (2026-11-12, second half): a sudden-death sting (`sudden` cue in `arcade-cues.ts`, three synth layers, plays instead of the round cue on the sudden round start via the `sudden` reader passed to `addArcadeLayer`) and a whole-round timer state (`timerStyle` in `round-announcer.ts`: the word "SUDDEN" before the seconds, smaller size, magenta, for the entire round; the last-10-s red stays for normal rounds). Presentation only; the sim and SIM_VERSION are untouched. Covered by unit tests and `tests/e2e/arcade-rounds.spec.ts`.
