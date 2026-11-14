---
status: idea
added: 2026-11-14
---

# QA r26 scorecard

Fun 3.5/5, Graphics 3.5/5, Readability 3.5/5 (r25: 3.5/3.5/3.5), vs SF/MvC.

- Fun: the 2v2 Tag slot mouse click works (active ids [0,2] to [1,2]), resolving the r25 inconclusive note. Supers fire with a banner but the payoff is small (qa-r26-super-banner-portrait-box). Curomo key 2 is Snag (rope root, ROOTED shown); the Ice Shock frost burst was not reached, so it is unverified.
- Graphics: fire, water and earth stages are good; earth is brighter than the r24 murky note. The hit flash silhouette clipping recurs (qa-r26-hit-flash-clipped-silhouette).
- Readability: own-element foes blend into floors (qa-r26-own-element-low-contrast); the air stage is faint (qa-r25-wispera-faint); chip glyphs are confusing (qa-r26-status-chip-glyphs).
- Menu, Help, Tour and Versus are clean with no console errors. Phone menu zigzag (qa-r26-phone-menu-zigzag).
- e2e subset: 18 pass, 1 fail (qa-r26-e2e-versus-hero-query-timeout).

Screenshots: `~/claudetmp/qa26/` (menu, help, versus, play, st-*, super-fiara-*, v2-*, curomo-special-*).
Not done: phone-viewport fight, audio cues.
