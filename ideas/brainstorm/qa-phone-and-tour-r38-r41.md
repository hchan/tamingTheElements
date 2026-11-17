---
status: idea
added: 2026-11-14
---

# Phone layout and Tour card: QA rounds r38 to r41

One file for the phone-landscape (667x375, 844x390) and Tour card findings of r38 to r41; r41 records which r40 fixes were verified.

Merged from: `qa-r38-phone-layout`, `qa-r39-phone-and-tour`, `qa-r40-phone-and-tour`, `qa-r41-phone-followups` (old file names kept here so older scorecards that cite them still resolve).

<!-- merged from qa-r38-phone-layout.md (added 2026-11-14) -->
## QA r38 phone 667x375 findings

Sheet: ~/claudetmp/qa-r38/sheet-phone.png (ph-menu, ph-picker, ph-fight1, ph-fight2, ph-help).

- Versus picker at 667: the hero cards (You / Computer) are cut off by the sticky Fight!/Back bar; you only see the first card header ("player Sindarosa", "enemy Rokcore") and must scroll inside a tiny region. Add a compact hero-select row or shrink the opponent/team/arena block (it uses 3 rows plus a 2-line paragraph).
- 2v2 fight at 667: the virtual stick overlaps the first action-bar slots (Blast / Flame / Tag); the Tag button is partly under the stick. Move the stick above the bar or shift the bar right in 2v2.
- 1v1 fight at 667: fighters are small (about 60 px tall) in a wide arena; the FIRE x2 chips are comparable in size to the fighters' heads. Hide the terrain chips after about 3 s on phones.
- First-run card sits in the middle of the arena between fighters; acceptable since it times out, but "Got it" is a small tap target.
- Menu and Help at 667 are clean; Help jump chips wrap fine.

### Progress

- 2026-11-14: fixed the first two findings (CSS only, appended to src/ui/styles/main.css, `(pointer: coarse) and (max-height: 420px)` landscape). Versus picker: title visually hidden, the arena hint hidden, rows tightened (44 px targets kept), so the You / Computer cards clear the Fight!/Back bar. Touch stick raised to sit above the action bar (was over Blast / Flame / Tag in 2v2). E2E: `tests/e2e/touch-fight-layout.spec.ts` "small phone landscape, QA r38". Shots: ~/claudetmp/phone-r38/{before,after}-*.png. Terrain-chip hide and Got it size remain open (chips belong to src/game/fx, off limits here).

<!-- merged from qa-r39-phone-and-tour.md (added 2026-11-14) -->
## QA r39 phone layout and Tour

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

### Progress (phone-r39 agent, 667x375)

- Done: first-run card is see-through and click-through apart from Got it, and its phone line now says "Stick moves you. Tap the bar: 1 and 2 strike, plus Dash, Guard, Super" (main.css append; first-run-hint.ts).
- Done: 2v2/3v3 picker slots sit in a row on phone landscape, so the partner is beside the first hero and above the Fight bar (main.css append).
- Done: Tour tiles read "Stage 1  Air" with Next / Locked badges beside the Cleared stamp; the full phrase moved to aria-label. The stage card has a "Your team" portrait strip, lead highlighted (tour-select.ts/.css, tour.ts).
- Attack buttons: the strike slots are drawn on the canvas by action-bar.ts (off limits here), so clarity came from the hint text only. A dedicated right-thumb attack button is still open.
- NOT done: 2v2 HUD bare life numbers. The format lives in Hud.ts/arcade-hud.ts (off limits), not slim-hud.ts/hud-math.ts.
- Tests: tests/e2e/touch-fight-layout.spec.ts "QA r39" block; tour-select.dom.test.ts updated. Shots: ~/claudetmp/phone-r39/after/.

### Progress (touch-attack agent, 667x375)

- Done: a right-thumb attack control. `src/game/app/touch-strike.ts` adds two round, labelled "Strike 1" / "Strike 2" buttons (bottom right, 56 px, mirrored for left-handed, same height as the stick so they clear the action bar). They hold the same keys as bar slots 1 and 2 (`holdAction` in touch-controls.ts); the bar's boxes and 44 px overlays are unchanged. Mounted in Versus, Tour and Online. Layout and key-hold tests in tests/e2e/touch-fight-layout.spec.ts ("touch attack buttons") and touch-strike.dom.test.ts.
- Done: 2v2 phone life line. Hud.ts `setSlimLabel` now cuts the hero name first (down to 5 letters, "SIND...") so the life reads "220/220" instead of the bare "SINDAROSA 220"; the bare forms stay only as the last fallback.
- Shots: ~/claudetmp/touch-attack/before and after (small-strike-1v1/2v2.png, small-2v2-life.png).
- Open: strike buttons wear the word Strike, not the hero's ability names (Blast / Flame); the bar still shows those.

### Progress (picker-phone agent, 667x375 and 844x390 touch landscape)

- Done: the 2v2/3v3 Versus picker's "N of 2 picked" line now sits on the side title row (right), above the cards and clear of the sticky Fight bar; hero names stay on one line (0.85em, ellipsis as a last resort) so "Sindarosa" no longer breaks mid-word; slot faces 30 px, all buttons keep 44 px. CSS only, in the touch-landscape block of src/ui/styles/main.css.
- Test: tests/e2e/versus-layout.spec.ts "2v2 picker on touch landscape" (status above the bar, no wrapped/clipped names). Shots: ~/claudetmp/picker-phone/.

<!-- merged from qa-r40-phone-and-tour.md (added 2026-11-14) -->
## QA r40 phone layout and Tour

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

### Progress

- Done (phone-tour-r40): Strike buttons keep a 16 px margin plus the safe-area inset from the screen edge (main.css); the first-run hint docks beside the stick in the bottom band (mirrored when left-handed); Tour card captions no longer overlap (portraits sized by their captions, team strip captions wrap inside the panel), the title is no longer scrolled off (Fight focus uses preventScroll) and the card fits 667x375, 844x390 and 1280x720. Specs: tour-card (three sizes, caption overlap, title, team strip) and touch-fight-layout (strike margin, hint beside stick). Not done: the 1v1 life-line format (last bullet).

<!-- merged from qa-r41-phone-followups.md (added 2026-11-14) -->
## QA r41: phone follow-ups after the r40 fixes

r40 fixes verified at 667x375 and 844x390: Strike 1 now fits inside the right edge, the first-run hint docks left of the Strike buttons and no longer sits mid-arena, and the Tour card at 667x375 has no label collisions (stage list, FIGHT / MAIN MENU all readable).

Still open (screenshots ~/claudetmp/qa-r41/s/):
- ph-fight2.png (2v2, 667x375): names truncate to "SIND..." / "ROKC..." and the two TAG portraits sit under the centre timer, crowding the life bars. Consider hiding bench portraits' TAG caption or shrinking them on narrow widths.
- ph-picker2v2.png (667x375): "Your partne..." label truncated, and the Swap up / Clear buttons are clipped under the Fight bar; the picker needs a scroll hint or a shorter row.
- ph-fight1.png: the hint box ("Stick moves you. Tap the bar...") still covers about a third of the lower arena on 667x375 until dismissed; auto-dismiss after the first Strike would clear it.
