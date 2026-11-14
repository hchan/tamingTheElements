---
status: idea
added: 2026-11-14
---

# QA r27 scorecard

Fun 3.5/5, Graphics 3.5/5, Readability 3.0/5 (r26: 3.5/3.5/3.5), vs SF/MvC. Shots in ~/claudetmp/r27/shots/.

- Verified working: World Tour end to end (picker, Stage 1 card, splash, 3-foe fight, KO, round result, Stage 2 card) on desktop 1280x720 and phone 844x390 with touch, no console errors (t0-desk-*, t0-phone-*). Ice Shock frost burst on Curomo works with Digit1 (mark-curomo-1.png); resolves the r26 unverified note. Status chip glyphs render (t0-desk-r1-ko-final-a.png). Audio cues are logged via __TTE__.sfxLog (click, hit, cast); no super cue seen in the log (qa-r27-super-no-sfx-and-late-damage).
- Not verified: void signature mark (?hero=eternal-void silently falls back to Sindarosa; my hand-seeded tte.tour.v1 stage-8 state did not resume).
- Fun: supers still read weak (qa-r27-super-no-sfx-and-late-damage).
- Graphics: super portrait still in an opaque black box (qa-r27-super-portrait-box-persists); hit marks small (qa-r27-hit-marks-small).
- Readability: phone HUD tiny and result panel covers the fighters (qa-r27-phone-hud-and-result-panel); stage card CLEARED stamp hides the Stage 1 label (qa-r27-tour-cleared-stamp-overlap); banner and text stacking (qa-r27-overlapping-banners-and-floaters).
