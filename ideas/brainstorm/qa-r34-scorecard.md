---
status: idea
added: 2026-11-14
---

# QA r34 scorecard (headless Chromium SwiftShader, test build of main aafd1af7)

Scores 0-5 vs Street Fighter / MvC (r33 was 3 / 3.5 / 3.75).

- Fun: 3 (unchanged). Snag, tag, supers and hazards vary the fight; plain hits still feel light.
- Graphics: 3.5 (unchanged). Four stages cohesive; gale rails now calmer, lava tag-in readable.
- Readability: 4 (+0.25). Gold SUPER rim, dark Tour card and fainter gale rails each help; PAX IN overlap and the first-run card still clutter the opening.

Verified (real time, not manual=1): menu, Versus hero select, 1v1 on Fire/Water/Earth/Air, gale warn and active, super, 2v2 tag swap on lava, Tour, Help at 1280x720, 844x390 and 667x375. Gold life-bar rim shows when SUPER is full (real time only; manual=1 does not advance the HUD ms counter). Dark Tour card legible. Gale rails fainter, slightly busy still. Tag-in Pax on lava reads better. e2e: touch-fight-layout (11) and app-flow (2) pass. No console errors.

Screenshots: ~/claudetmp/qa-r34/ (rim5-sheet.png, gale-*.png, tag-1280-*.png, hero-*.png, tour*.png, rt-*.png)

Follow-up (weather-gale-polish): gale lane now draws one edge arrow per side, a fainter dark outline, glow and chevrons; warn stays readable (shots ~/claudetmp/wgp/). Left in brainstorm until the next QA round confirms.
