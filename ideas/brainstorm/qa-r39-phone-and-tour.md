---
status: idea
added: 2026-11-14
---

# QA r39 phone layout and Tour

Screenshots: ~/claudetmp/qa39/s/ph-*.png, tour-*.png.

Tour (redesigned card, played stage 1 with Fiara/Rokcore/Curomo, foes Wispera, Cyclonius, Sindarosa, wins via setHp):
- Card good: heading, three foe portraits with element labels, Location / Opponent / Difficulty (diamonds) / Continues (dots), nine stage tiles, big Fight, Main Menu. Fits 667x375 with Fight in view.
- Stage tile text reads "STAGE 1: AIR, NEXT" / "STAGE 2: EARTH, LOCKED": the comma phrasing is an accessibility label shown as visible text; show "Stage 1  Air" plus a state badge (CLEARED badge already exists) and a lock glyph or dim for locked.
- The card shows the foes but not your own team; a 3-portrait strip of your heroes (current lead highlighted) would complete it.
- Playing through: splash, fight with 3v3 tag roster HUD (both sides show portraits), win, "Stage 2 of 9" card with Stage 1 CLEARED. Works, no errors.

Phone 667x375 (touch):
- Menu, Help OK. Help tab row and jump chips fit.
- Versus picker 1v1: Fight!/Back bar covers the lower part of the scrolling content (a half-hidden hero card peeks behind it); acceptable but the sticky bar is tall (about 60 px of 375).
- Versus picker 2v2: the 2v2 explanation text and hero cards push the partner picker below the fold; "Your partner" label peeks under the sticky bar and is cut. Consider putting the partner row directly under Team.
- 2v2 fight: life shown as bare numbers ("SINDAROSA 220", "ROKCORE 224") with a tiny roster card between; no bar fill visible on the thin bars. Desktop shows "Life 598/598". The first-run hint box ("Drag the stick...") sits mid-arena and covers the action; it dismisses with Got it but blocks the first seconds.
- Touch fight shows only the stick and the action bar; the hint text mentions "tap the buttons" but I could not see strike buttons right of the arena in this frame (they may be the numbered action bar). Worth a clearer 'attack' button on the right thumb.

e2e subset run 2 result: 36 passed (2.7m), same as run 1.
