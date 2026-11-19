# QA r122 findings

status: idea
added: 2026-11-19

Build: main at 7491ef07 (`Merge sticky bar scroll padding (scroll-pad)`), dev server in test mode, headless Chromium with SwiftShader, `?manual=1&seed=7&ff=arcade`, 1280x720 only.
Screenshots: `.scratch/qa-r122/`. Stepped play (manual ticks) except the Tour walk timing, which was live.

## 1. Help chip layout still ragged

status: idea
added: 2026-11-19
severity: low

The "Jump to" chips wrap 2 / 3 / 5 per row with the label inline, and the first section starts half off-screen (`30-help.png`). Not fixed since r121.

## 2. Picker "More below" chip overlaps the arena-help sentence

status: idea
added: 2026-11-19
severity: low

The chip sits over the end of the arena-help sentence, which the sticky bar also clips (`02-versus.png`). Still present.

## 3. HUD life does not match the picker Life

status: idea
added: 2026-11-19
severity: medium

Picker shows "Life 100". HUD shows 286/286 (Sindarosa), 321 and 308 (Rokcore), 297 and 591 (2v2 Sindarosa and Pax), 228/228 and 352/352 in Tour stage 3. Players cannot connect the two numbers; show the same scale in both, or label the picker stat as a rating.

## 4. Super cut-in covers the Weather chip but not SAFE/STUN chips

status: idea
added: 2026-11-19
severity: low

The cut-in band (y 130-245) hides the Weather chip while SAFE/STUN chips at y~90 stay visible (`13-super.png`). Inconsistent; decide whether chips should dim during the cut-in.

## 5. Tour stage 1 dead walk still about 4-6 s

status: idea
added: 2026-11-19
severity: medium

Live run: the foe starts at x=1360 and first reaches the player after roughly 4 to 6 s of wall time (SwiftShader; real hardware may be a little quicker, the ~6.6 s earlier figure is consistent). Nothing happens before then; the player is idle. Open with the foes closer, or a dash-in, for stage 1.

## 6. Verified fixed

status: idea
added: 2026-11-19
severity: none

- 2v2 results fit at 1280x720: scroll height 720, buttons end at 658, Rematch focused, Escape goes to `#main` (`23-2v2-results.png`).
- Settings Escape with a slider focused goes to `#main`.
- Key Bindings Shift+Tab with the sticky bar: no focused control hidden behind `.settingsBar` over an 80-press sweep (`45-kb-shifttab-end.png`).
- Smoke: `e2e ran on: PC (job 20261119-142449-short-56a740, short lane) -> exit 0` (15 passed).
