---
status: idea
added: 2026-11-14
---

# QA r23 scorecard

Headless Chromium, port 7923, shots in `~/claudetmp/qa-r23/`. r22 in brackets.

- Fun: 3.5 (3.5). Tour and Versus work; hits still mostly trade.
- Graphics: 3.5 (3.5). Stages luminous; Ice Shock burst and Wispera still weak.
- Readability: 3.5 (3.5). Joystick still covers the hero; KO banner and combat text are good.

Verified OK: Tour Fight button has a gold focus glow and is above the fold at 1280x720 and 844x390; the K.O. banner is solid and legible at phone size; combat text (ROOTED, SNAG, CHARGE!, hit counter and DMG total) is clear; the water tide bar shows a RAIN countdown; `?hero=curomo&foe=rokcore` opens the real Versus arena; no console errors.

Not verified: Online Arcade wide view (needs a peer link); the tutorial card (not seen in a 30 s random-input tour).

Findings: qa-r23-ice-shock-burst-still-faint, qa-r23-phone-versus-fight-button-still-offscreen, qa-r23-phone-joystick-still-covers-hero, qa-r23-wispera-air-stage-faint.
