---
status: done
added: 2026-11-13
---

# QA: heroes are tiny, the play area is small (feel vs Street Fighter / MvC)

Severity: high. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/vp-1920x1080.png, hit-5.png

Heroes are about 70 px tall on 720 px (under 10 percent of screen height); SF/MvC fighters fill 30 to 40 percent. The HUD takes 180 px at the top and the bar 80 px at the bottom, leaving a letterboxed strip. Hit sparks and damage numbers are bigger than the fighters. DUPLICATE of the in-progress hero scale work; recorded as a measured baseline, re-judge once that lands.

Resolved 2026-11-14: re-measured on main with headless screenshots (1280x720, 1920x1080). Arcade heroes are drawn 2x (hero-scale.ts, giants capped at 200 px) and the sprite frames carry overscan, so a normal hero is about 22 percent of the picture height by its box and 30 percent by its art, at the pan camera framing. The 70 px figure predates the 2x work (see ideas/done/bigger-hero-sprites.md). Pinned by tests/e2e/hero-scale.spec.ts (box height at least 18 percent). No renderer change needed.

Resolved 2026-11-14: re-measured on main with headless screenshots (1280x720, 1920x1080). Arcade heroes are drawn 2x (hero-scale.ts, giants capped at 200 px) and the sprite frames carry overscan, so a normal hero is about 22 percent of the picture height by its box and 30 percent by its art, at the pan camera framing. The 70 px figure predates the 2x work (see ideas/in-progress/bigger-hero-sprites.md). Pinned by tests/e2e/hero-scale.spec.ts (box height at least 18 percent). No renderer change needed.
