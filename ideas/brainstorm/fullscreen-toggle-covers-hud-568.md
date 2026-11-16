---
status: idea
added: 2026-11-16
---

# Fullscreen toggle covers the foe HUD at 568x320

On a 568x320 touch phone the fullscreen toggle (`#fullscreenToggle`, 44x44 at x 520..564, y 14..58, shown under 740 px wide) sits on top of the foe's name and life readout ("ROKCORE ■ 321", x 483..568, y 14..26) and the end of its portrait. Found by the `test.fail` case in `tests/e2e/small-viewport-fight.spec.ts`.

Fix options: move the toggle below the HUD band (next to Pause), hide it while a fight is on, or shrink it. Then drop the `test.fail`.
