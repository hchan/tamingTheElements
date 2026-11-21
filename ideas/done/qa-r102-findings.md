---
status: done
triaged: obsolete (phone/portrait/touch work dropped by owner 2026-11-18/19; every item is phone-viewport polish)
added: 2026-11-17
---

# QA r102 findings

Build: main at 10ca8a76, test mode, headless Chromium (SwiftShader), device scale 2 on phones. Shots in `.scratch/shots102/` of the r102 QA worktree (gitignored).
No console or page errors in any scripted run. No e2e suite run this round (manual capture only).

## Verified fixed since r101

- Online role screen at 360x640: heading one line, `Back` count 1, role buttons large (`online-p360.png`, `online-onlineRoleHost-p360.png`; DOM read: h2 height 36 px, normal line height).
- Portrait Strike labels: "Strike 2 / Flame" and "Strike 1 / Blast" fully inside their 64 px circles at 360 and 390 (`f2-versus-p360-b.png`, `f2-tour-p390-b.png`; scrollWidth <= clientWidth).
- Portrait action bar is now a single row of 8 slots plus the two round Strike buttons in plain Versus at 360 and 390 (`f2-versus-p360-b.png`, `fight-versus-p390-b.png`).

## P2

1. Portrait arena at 390x844 is still mostly sky. About 330 px of empty ember sky sits above a floor band of roughly 70-90 px; fighters are about 45-50 px tall (`fight-versus-p390-b.png`, `fight-versus-p390-c.png`, `f2-tour-p390-b.png`). At 360x640 the same layout is good (`f2-versus-p360-b.png`), so the zoom fit seems to be limited by width on the taller phone. Idea: for aspect ratios taller than about 19:9 crop the sky (cap sky height, or raise camera zoom until the floor fills 45-50% of the canvas) and let the freed height go to the floor. Pointers: `src/game/scenes/Arena.ts` camera fit, the portrait `tall` helper tested in `tests/e2e/portrait-play.spec.ts`.
2. Portrait Tour/2v2 action bar is two rows (Tag, Tag, Melee, Weather, Dash / Guard, Super, Bomb, Ember, Cleanse) and covers the lower floor on the same screen where the fighters stand (`f2-tour-p390-b.png`). Idea: move the Tag pair next to the Strike buttons (as two small round buttons) so the bar stays one row; or let the second row overlay the empty sky instead of the floor.
3. Portrait HUD names truncate ("SINDAR..." in Tour, "SINDA..." in the round banner at 390) while the tag thumbnails and the status chip ("SAFE", "GALE +20%") crowd the same strip and the second-row thumbnails overlap the HP bar area (`fight-versus-p390-c.png`, `f2-tour-p390-b.png`). Idea: show a 3-letter or icon-only name on portrait (the portrait already identifies the fighter), and move status chips below the tag thumbnails.

## P3

4. Portrait Strike label stack is three lines ("Strike" / "2" / "Flame") with the digit in the middle at a larger size. Reads fine, but "Strike 2 Flame" in one line plus ability icon would be tighter. Optional.
5. Landscape (844x390): Strike buttons say only "Strike 1/2" with no ability name, unlike portrait (`fight-versus-l844-b.png`). Idea: add the ability name line here too, for consistency, since there is room beside the canvas.
6. Online (all phone sizes): the intro paragraph runs to about 8 px from the screen edge while the card below is inset about 16 px; text and card edges do not align (`online-p360.png`). Add matching side padding.
7. Help (360): jump chips use mixed sizes (the first two rows are smaller than "Key Bindings / Guide / Wiki / Watch the story / About"); "Back" is indented differently from the chips (`help-p360.png`). Cosmetic.
8. Rotate overlay (390 portrait): "Play anyway" and the Tour "Stage 1 of 9 / 3 continues left" chip use a sans-serif face, unlike the serif UI elsewhere (`rot-versus-p390.png`, `f2-tour-p390-b.png`). Also the Pause button sits lower than where it sits after dismissal (y 125 vs 10), so it jumps. Idea: one font stack for these overlays and keep Pause pinned.
9. Versus picker at 390: the collapsed "Options" chip is flush under the title with its top border partly cut (`versus-p390.png`). Add 8 px top spacing.

## Not covered (follow up)

- Match-end win and lose cards (r101 P3 item 6 still open); 2v2 portrait at 390; Tour fight at desktop and landscape. A scripted `__TTE__` driver that finishes a round (not tap spam) would unblock all three.

## Checked and fine

- Menu, Help, Settings, Online, Versus, Play at 1280x720, 390x844, 844x390, 360x640: no horizontal overflow, no Classic/Arcade/ruleset/Capture words.
- Landscape fight at 844x390: big arena, full bar, Super/HP HUD legible, "FIGHT!" banner and damage numbers readable.
- Lava and ice (air) stages render with distinct backdrops and floors.
