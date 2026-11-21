# QA r121 findings

status: idea
added: 2026-11-19

Build: main at 724b7ce1 (`Merge tour chips and Help height`), dev server in test mode, headless Chromium (SwiftShader) at 1280x720 only, `?manual=1&seed=7`. Screenshots live under `.scratch/qa-r121/`. Scores are in `qa-r121-scorecard.md`.
Stepped play (manual ticks), not live input. Each entry below is its own idea.

## 1. 2v2 results screen still does not fit 720p; Rematch is not focused; Escape does nothing

status: idea
added: 2026-11-19
severity: high

The recent fix did not show up at 1280x720. After a 2v2 win the page scrolls (scroll height 758). Rematch sits at y 603-661, but "Change fighters" and "Main Menu" sit at y 693-743, so the bottom 23 px of the second row is cut off. `document.activeElement` is the "Victory!" heading, not Rematch, and no button shows a focus ring. Pressing Escape leaves the screen unchanged (the hash reads `#versus` both before and after, and the results stay on screen).
Screenshots: `.scratch/qa-r121/42-results-settled.png`, `.scratch/qa-r121/43-after-esc-settled.png` (also `40-2v2-results.png`).
Idea: shrink the winner tile and the stat sentence so all three buttons fit in 720; focus Rematch when the screen opens; make Escape go to the main menu. Re-check the cause first: this may be a stepped-play artefact (arena stepped by hand and the screen reached at once), so confirm with one live match.

## 2. Settings: Escape does nothing while a slider has focus

status: idea
added: 2026-11-19
severity: medium

On `#settings`, with the Music volume slider focused, Escape stays on Settings. With nothing focused, Escape returns to `#main`. A keyboard player who just adjusted volume cannot leave with Escape.
Screenshot: `.scratch/qa-r121/50-settings.png`.
Idea: let Escape bubble from range inputs (arrow keys are the only keys a slider needs).

## 3. Help: Jump-to chips are three rows (4, 1, 4), not two rows of three

status: idea
added: 2026-11-19
severity: medium

There are nine chips at 1280x720. They lay out as How to fight / Controls / Choosing your heroes / Ways to play, then Reading the arena alone, then Key Bindings / Guide / Wiki / Watch the story / About. The orphan chip makes the block look ragged and pushes the first section half off the screen. The touch table is gone, which is good.
Screenshot: `.scratch/qa-r121/30-help.png`.
Idea: set the chips to a three-column grid (three rows of three) or drop the rarely used ones to a "More" row so the groups read evenly.

## 4. Tour card does not name the lead hero's abilities, and lists a Snag key the hero lacks

status: idea
added: 2026-11-19
severity: medium

Fights 2 and 3 of the Tour are reached (stage 1 to 4 cards show, `63-tour-after-3`), so progress works. But the stage card names no abilities of the lead hero: its Controls row is generic ("1 Strike, 2 Special, C Snag, 7 Dash, 8 Guard, 9 Super, Tab Run, 3 4 Tag"), while Sindarosa's real bar shows Blast, Flame, Bomb, Ember and no Snag slot at all. The card also appears only on first run.
Screenshots: `.scratch/qa-r121/61-tour-card-1.png`, `.scratch/qa-r121/61-tour-fight-1.png`.
Idea: build the Controls row from the lead hero's kit (1 Blast, 2 Flame, ...) and show a Snag chip only for heroes that have it.

## 5. Weather chip shows the fire glyph on every stage

status: idea
added: 2026-11-19
severity: low

The small "RAIN +20%" and "GALE +20%" chips top left carry a triangle (the fire glyph) even on Water and Air stages.
Screenshots: `.scratch/qa-r121/07-stage-water.png`, `.scratch/qa-r121/06-stage-air.png`.
Idea: show the glyph of the weather's own element, or drop the glyph.

## 6. Super call-out overlaps the combo counter and status chip

status: idea
added: 2026-11-19
severity: low

During the Hellfire Lance cut-in, the "3 HITS / 60 DMG" counter sits on top of the "SAFE" chip, and the foe's STUN chip crowds the bench portrait.
Screenshot: `.scratch/qa-r121/16-super-freeze.png`.
Idea: hide the combo counter and the safe chip for the length of the cut-in, or move the counter below the band.

## 7. First-run hint card sits on the arena floor in the middle of the fight

status: idea
added: 2026-11-19
severity: low

"First blood" with a "Got it" button covers the lower centre of the arena for the first fight on every stage shot. It is readable but sits on the action row, and it does not mention the Tag key until later.
Screenshots: `.scratch/qa-r121/04-stage-fire.png`, `.scratch/qa-r121/06-stage-air.png`.
Idea: dock it above the action bar or auto-dismiss after the first move.

## 8. Test failure: `tests/e2e/keyboard.spec.ts:93` fails on this main

status: idea
added: 2026-11-19
severity: medium

`no keyboard trap on #keyBindings: Tab reaches Back and Enter leaves` fails: "Tab never reached Back in 60 presses (last: Reset stick deadzone)". The other 12 tests in the file pass (one run, PC, job 20261119-133300-short-c28cc6). The Key Bindings page now holds more focusable controls than the 60-press budget, so this is either a real trap-by-length for keyboard players or a stale budget in the test.
Idea: put Back (and Save) first in the tab order on Key Bindings as on Settings, or raise the budget and add a skip link.

> Caveat (coordinator): this round built origin/main 724b7ce1, which lacks the local results/Escape, Help text and Tour wording merges (2026-11-19). Findings on those three areas are stale; the keyboard.spec.ts:93 failure is real on that base. r122 must build local main.

triaged: 2026-11-21 partly fixed: item 2 (Escape on slider) in src/ui/keyboard.ts; item 7 by 81ce03a2 (first-run hint scales). Items 1, 3, 4, 5, 6 not code-checked as small; keep open, re-QA live.
