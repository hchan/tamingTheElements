---
status: done
added: 2026-11-14
---

# Fight intro name watermarks are clipped at the screen edges (r15)

The giant FIARA / SINDAROSA / PAX name text behind the intro is cut off at the left and right edges (10-fire-intro.png, 64-ko-3.png). Scale it to fit or let it slide in fully so it reads as intended.

Done 2026-11-14 (qa-r15-layout): fixed; verified by headless screenshots at 1280x720, 844x390, 390x844, tests/e2e/layout-r15.spec.ts and a slim-hud unit test. Tour tiles also got Level/Continues labels and tooltips.
