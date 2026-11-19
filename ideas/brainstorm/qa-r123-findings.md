# QA r123 findings

status: idea
added: 2026-11-19

Build: main at 602f205d (`Merge picker life matches HUD life (picker-life)`), dev server in test mode, headless Chromium with SwiftShader, 1280x720 only.
Screenshots: `.scratch/qa-r123/` (key ones copied to `~/claudetmp/qa-r123/`). Live keyboard input (no `manual=1`) for a full 1v1 (Fiara vs Lavax), a full 2v2 to the results screen and a four-stage Tour walk; stepped play for the four-stage 1v1 sweep and the 2v2 tag and super frames.

## Verified fixed this round

- Picker Life now equals HUD life: Sindarosa 228 (Tour/1v1), Pax 591, Fiara 519 (2v2), Lavax 400, Fiara 547 (1v1 HUD). No mismatch found.
- Tour stage 1 rush: from "Fight!" (tick 91) the foe closed from 599 to 232 px in 34 ticks (about 0.7 s live, `73-tour1-contact.png`). Dead walk is gone. No console errors over all runs.

## 1. Help chip layout still ragged

status: idea
added: 2026-11-19
severity: low

The "Jump to" chips wrap 2 / 3 / 5 per row with the label inline, centered unevenly, and the first section starts half off-screen at 1280x720 (`80-help.png`). Open since r121.

## 2. Picker "More below" chip overlaps the bottom of the list

status: idea
added: 2026-11-19
severity: low

At the bottom right of the 2v2 picker the "More below" chip sits on the edge of the sticky bar, over the last row region (`04-picker-2v2.png`). Open since r122.

## 3. Key Bindings opens scrolled down

status: idea
added: 2026-11-19
severity: medium

Opening Key Bindings from Settings keeps the previous scroll offset: the page title, intro line and the first rows (Up, Down) are scrolled out of view and only a sticky Back is visible (`82-keybindings.png`). New players see the middle of a table with no heading. Scroll to top on route change.

## 4. Key Bindings and ability bar disagree on key labels

status: idea
added: 2026-11-19
severity: low

The table lists Super = X (alternate 9), Dash = E (7), Guard = Q (8), Charge = H (5), and Tag 3 = 5. The HUD bar and Tour card show only the number keys (9 Super, 7 Dash, 5 Melee/Charge), so in a 3v3 key 5 is both Tag 3 and Charge. Pick one primary label per action in the bar and avoid the 5 collision.

## 5. Tour carries damage into the next stage with no cue on the card

status: idea
added: 2026-11-19
severity: low

After stage 1 the lead started stage 2 at 12/228 life, and stage 3 and 4 started with Pax stepping in at 105/455 and 355/455 (the card says "Sindarosa is down. Pax steps in."). This may be intended, but the stage card shows only continues, not team health, so a player cannot tell before pressing Fight that the lead is almost dead. Show per-hero life on the card or on the "Your team" row.

## 6. Super cut-in band covers status chips and the tag timer

status: idea
added: 2026-11-19
severity: low

The Titan Slam cut-in (y 120 to 260) overlaps the ADREN and SAFE status chips (partly dimmed, partly legible) and the lower edge of the team chips (`62-super-1.png`). Same family as the open r122 item; decide whether HUD chips dim or hide for the cut-in.

## 7. Idle player vs bot gives no first-contact signal

status: idea
added: 2026-11-19
severity: low

In Tour stage 1 the foe stops at 232 px and never closes further for the idle player in the first 0.7 s; `min dist 232` was held. Good for pacing, but there is no wind-up cue (flash, growl, telegraph) before the rush starts. A short telegraph would make the opening read as a fight start rather than a walk.

## Feel notes

- Hit feedback in live 1v1 is readable (flame trails, blue outline hit flash on Lavax in `40-fiara-03.png`) but light; there is no hit-stop or screen shake visible in frames, so blows lack the weight of SF/MvC. Idea: 2 to 3 tick hit-stop on super and heavy hits.
- A naive attack-only bot dealt no damage because the first shots hit a rock obstacle and stunned the player: obstacle collisions on blasts need a clearer cue.
- Tag swap (`51-tag-2.png`, `60-tag-2.png`) and super cut-in (`62-super-1.png`) read well; super banner with element name is the best moment of the game.
- Results screen (`53-2v2-results.png`) is clear: Winner badge, Victory, rounds 2-0, Rematch focused.
