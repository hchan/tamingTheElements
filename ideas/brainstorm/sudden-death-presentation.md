---
status: idea
added: 2026-11-12
---

# Sudden death presentation

Follow-up to ideas/in-progress/sf-round-timer-draws.md. The sudden-death round has a banner and a screen-reader line.

Done (2026-11-12): verified in a real game. The dev/test-only tester hook `__TTE__.arena.setRoundsWon(w0, w1)` (Arena.ts, dropped from production builds; the sim and SIM_VERSION are untouched) plus a double KO reaches the 2-2 draw; `tests/e2e/arcade-rounds.spec.ts` asserts the "SUDDEN DEATH" banner, the assertive live line ("Sudden death. One hit may decide the match.") and 10% life, and screenshots it. The screenshot showed the banner fits the 1280 px width once its scale-in (30 ticks) has finished; the life bars already read "10% LOW", and the timer already turns red under 10 s.

Still open: a sound sting, and a distinct timer colour for the whole sudden-death round (today only the last 10 s warn).
