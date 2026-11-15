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

## Progress (phone-r39 agent, 667x375)

- Done: first-run card is see-through and click-through apart from Got it, and its phone line now says "Stick moves you. Tap the bar: 1 and 2 strike, plus Dash, Guard, Super" (main.css append; first-run-hint.ts).
- Done: 2v2/3v3 picker slots sit in a row on phone landscape, so the partner is beside the first hero and above the Fight bar (main.css append).
- Done: Tour tiles read "Stage 1  Air" with Next / Locked badges beside the Cleared stamp; the full phrase moved to aria-label. The stage card has a "Your team" portrait strip, lead highlighted (tour-select.ts/.css, tour.ts).
- Attack buttons: the strike slots are drawn on the canvas by action-bar.ts (off limits here), so clarity came from the hint text only. A dedicated right-thumb attack button is still open.
- NOT done: 2v2 HUD bare life numbers. The format lives in Hud.ts/arcade-hud.ts (off limits), not slim-hud.ts/hud-math.ts.
- Tests: tests/e2e/touch-fight-layout.spec.ts "QA r39" block; tour-select.dom.test.ts updated. Shots: ~/claudetmp/phone-r39/after/.

## Progress (touch-attack agent, 667x375)

- Done: a right-thumb attack control. `src/game/app/touch-strike.ts` adds two round, labelled "Strike 1" / "Strike 2" buttons (bottom right, 56 px, mirrored for left-handed, same height as the stick so they clear the action bar). They hold the same keys as bar slots 1 and 2 (`holdAction` in touch-controls.ts); the bar's boxes and 44 px overlays are unchanged. Mounted in Versus, Tour and Online. Layout and key-hold tests in tests/e2e/touch-fight-layout.spec.ts ("touch attack buttons") and touch-strike.dom.test.ts.
- Done: 2v2 phone life line. Hud.ts `setSlimLabel` now cuts the hero name first (down to 5 letters, "SIND...") so the life reads "220/220" instead of the bare "SINDAROSA 220"; the bare forms stay only as the last fallback.
- Shots: ~/claudetmp/touch-attack/before and after (small-strike-1v1/2v2.png, small-2v2-life.png).
- Open: strike buttons wear the word Strike, not the hero's ability names (Blast / Flame); the bar still shows those.
