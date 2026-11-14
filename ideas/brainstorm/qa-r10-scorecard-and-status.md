---
status: idea
added: 2026-11-14
---

# QA r10: scorecard and qa-r9 status

Build: worktree of main 63a6b898, dev server, headless Chromium (SwiftShader) 1280x720. Shots in ~/claudetmp/qa-r10/ (menu, versus-1, fire/water/air/earth-*, sw/se/sa/se2-stage-*, online-*, settings(-full), help(-full)). No console errors in any run. Never-show words: clean on menu, versus, online, settings, help, first-run card.

## Scores (0-5 vs Street Fighter / Marvel vs Capcom)

- Fun 3: unchanged; opening seconds passive, default fighters lopsided (Fiara 679 vs Pax 765).
- Graphics 3.5: fire, water, air and earth floors each read as a different place (rain streaks, pale gale floor, olive sand); outlined hit numbers good. Earth crystal prop still flat teal vector.
- Readability 3.5: stuck tooltip gone, chips better, but ROUND/FIGHT banners overlap chips and the first-run card still covers Pax.
- Intro feel 3.5: ROUND 1 then FIGHT! with name slam is clean; 70 ticks is snappier.
- Online screen 2: functional, Link readout works but mislabels (see qa-r10-online-link).

## Status vs qa-r9

- Stuck "Dash"/"Weather" tooltip over the field: FIXED (none in any fight shot).
- Settings legends and styled Relay inputs: FIXED. Background art still ends about 580 px down in full-page view (flat navy seam): OPEN, minor.
- First-run card: PARTLY. Gone after first input in later shots, but covers Pax and the last action slots at the start and shows over the black loading screen.
- Floor chips vs ROUND/FIGHT banner overlap: OPEN.
- Versus picker "0 of 1 picked" while a hero is shown: OPEN (unchanged).
- Earth crystal prop: DONE (faceted, inner glow, painterly dabs; terrain-props.ts).
- Wording: holds.
