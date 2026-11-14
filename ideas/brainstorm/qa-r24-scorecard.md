---
status: idea
added: 2026-11-14
---

# QA r24 scorecard

Headless Chromium, port 7924, shots in `~/claudetmp/qa-r24/`. r23 in brackets.

- Fun: 3.5 (3.5). Tag swapping and Snag work; specials still lack punch versus Street Fighter and Marvel vs Capcom.
- Graphics: 3.5 (3.5). Super banners strong; earth stages murky; most specials lack a hit effect.
- Readability: 3.5 (3.5). Menu focus ring and tag bench are clear; Settings, Help and Guide are very long.

Verified OK: five-entry menu with a clear gold focus ring and sensible Tab order; Esc returns Settings and Help to the menu and Guide to Help; no console errors at 1280x720 or 844x390; Snag rope with ROOTED and SNAG pops; super banners with portraits (Pax, Rokcore, Lavax, Morblass, Wispera and others); 3v3 tag bench, swap, KO and IN banner; Tour stage 1 starts from the Start tour and FIGHT buttons; audio reports unlocked and unmuted (log only).

Not verified: Tour run to the end or win screen (cheat win does not end a Tour round, and a 3v3 Tour fight outlasted the run); rematch flow; 2v2; supers for Curomo, Fiara, Ishimi, Treenoc (see finding); special sweep for Cyclonius, Echo and Sindarosa (arena load timeouts).

Findings: qa-r24-no-pause-menu, qa-r24-settings-page-long-and-debug-exposed, qa-r24-guide-heading-and-intro-contrast, qa-r24-hero-abilities-lack-hit-effects, qa-r24-some-supers-did-not-fire, qa-r24-earth-stage-murky, qa-r24-tag-swap-feedback-thin.
