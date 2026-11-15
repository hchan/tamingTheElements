---
status: idea
added: 2026-11-14
---

# QA r40 phone layout and Tour

Screenshots: ~/claudetmp/qa-r40/s/ph-*.png, p2-*.png (844x390), tour-card1.png.

Verified fixed since r39:
- Touch Strike 1 / Strike 2 round buttons now exist on the right thumb (667x375 and 844x390). Good and clear.
- 2v2 phone life line now reads "SIND... ▲ 229/229" with the roster cards between; numbers visible. 1v1 phone reads "SINDAROSA 272" / "ROKCORE ■ 321" (no "Life" word, no bar fill clarity on the thin bar).
- Tour card shows "Your team" strip with portraits.

Problems:
- 667x375: the Strike 1 button is cut by the right screen edge (about 12 px), and sits close to the Pause button area; pull both buttons in by the safe-area inset.
- 667x375: the first-run hint ("Stick moves you. Tap the bar...") still sits mid-arena over the action and between stick and buttons; dock it above the action bar or at the top, and dismiss on first stick move or strike.
- 667x375 and 844x390 Tour card: the foe portrait label "SINDAROSA (FIRE)" runs into the next portrait edge; at 1280x720 the "Your team" labels "ROKCORE (EARTH)" and "CUROMO (WATER)" overlap each other. Ellipsise, wrap, or stack the element under the name.
- 844x390 Tour card: the page title is cut off at the top (only descenders visible). Phone Tour team strip has no names (fine) but "YOUR TEAM" wraps to two lines at 667.
- 1v1 phone life line drops the "Life" word and numbers use the large font while 2v2 uses a smaller one; consider one format.

## Progress

- Done (phone-tour-r40): Strike buttons keep a 16 px margin plus the safe-area inset from the screen edge (main.css); the first-run hint docks beside the stick in the bottom band (mirrored when left-handed); Tour card captions no longer overlap (portraits sized by their captions, team strip captions wrap inside the panel), the title is no longer scrolled off (Fight focus uses preventScroll) and the card fits 667x375, 844x390 and 1280x720. Specs: tour-card (three sizes, caption overlap, title, team strip) and touch-fight-layout (strike margin, hint beside stick). Not done: the 1v1 life-line format (last bullet).
