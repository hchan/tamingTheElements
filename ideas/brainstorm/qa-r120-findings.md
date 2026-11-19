# QA r120 findings (desktop 1280x720, headless, main f1d3ba53)
status: idea
added: 2026-11-19

Method: dev server (`vite --port 7942`), Playwright headless Chromium (SwiftShader) at 1280x720. Live fights used a key-press bot (walk toward the foe, press Fireball or Snag) with no `manual`; forced KOs and the 2v2/Tour/parry checks used `?manual=1&seed=7` with `step`, `setHp` and a super. Screenshots in `.scratch/qa-r120/` (worktree). Scope was the r118/r119 gaps: match end and rematch, Snag, parry, pause, keyboard-only menus, Settings persistence, all 12 hero tiles, 2v2 to the end, Tour start. Items already in r118/r119 are not repeated.
Smoke: `e2e ran on: PC (job 20261119-122500-short-f8bf0e, short lane) -> exit 0` (15 passed, 2 m 05 s). Console/page errors: none in any run.
Banned-word scan (Classic, Arcade, ruleset, Capture) of Menu, Versus, Play/Tour card, Online, Settings, Help (all sections opened), Key Bindings and both results screens: none found.

## Checked and working

- W1 Full 1v1 to KO: KO banner with X'd portrait, "ROUND 1 WON / PERFECT K.O." stat card (health left, damage dealt/taken, longest combo, supers), final "WINNER ... VICTORY! Rounds 2-0" (`g-win.png`, `j-2v2-end.png`); DEFEAT screen for a loss (`d-end.png`). Rematch via Enter starts a fresh match at full life, rounds 0-0 (`g-rematch.png`).
- W2 Snag: playing Treenoc (Space), the foe shows "SNAGGED 1s" and ROOTED, then "NO SNAG 2s" as a lockout, and the HUD shows it (`d-fight-40.png`).
- W3 Parry: guard one tick before a cast gives a "PARRY" pop beside the defender (`j-parry.png`, Curomo vs Pax demo).
- W4 Pause: Escape pauses, dialog opens with focus on Resume, Tab cycles Resume, Restart, Quit to menu, Escape resumes, Quit goes to `#main` (`i-pause.png`).
- W5 Settings persistence: Music volume 100 to 30, Display size Largest (1.6) to Smaller (1.1) and Reduce motion on, then Save returns to `#main`; after a reload the values are all kept.
- W6 Hero select: all 12 tiles load a portrait and no name overflows (`hero-*.png`); the detail panel shows abilities, Treenoc's Snag text reads well.
- W7 2v2 tag team played to the end (forced KOs of both foes): "WINNER / VICTORY!" with a team summary line.
- W8 Tour: Play opens a three-hero picker, "Start tour" opens a stage briefing (stage 1 of 9, location, opponents, continues 3 of 3, controls), then Loading, then the arena with "Stage 1 of 9 / 3 continues left" shown bottom-left. I did not finish two Tour fights (a forced KO only felled the lead of a three-hero foe team).

## New issues

- N1 (medium) 2v2 results screen overflows 720 px. The description paragraph is three lines, so only Rematch is on screen in `j-2v2-end.png`; "Change fighters" and "Main Menu" are below the fold with no hint to scroll. The 1v1 DEFEAT screen fits but its buttons end at about y=715 (no bottom padding). Shorten the line (or collapse the team list) and add bottom padding.
- N2 (medium) Escape does nothing on the results screen (route stays `#versus`), and in Settings (stays `#settings`), while Help, Online and Versus return to `#main` on Escape. Make Escape mean Back or Main Menu everywhere.
- N3 (low) Results focus order: initial focus is the "Victory!" heading, not Rematch (needs one Tab to reach a button). After "Main Menu" Tab leaves the page (BODY stop), then wraps to Rematch. Same BODY stop on the menu (Play, Versus, Online, Settings, Help, BODY) and on Settings, Help, Online and Versus. Autofocus Rematch and trap or wrap focus inside the screen.
- N4 (low) Settings focus order starts at Save, then Back, then the sections (`SUMMARY Audio`, ...). Save before the fields it saves is backwards; put Back and Save last, or Back first.
- N5 (low) Display size is stored and persists (1.1) but has no visible effect on the menu or Settings (root font stays 16 px). I did not find where it applies, so it may only scale the in-fight HUD; label the row ("in-fight text size") or show a preview.
- N6 (low) Settings still lists on-screen button size, side and vibrate on a desktop (extends r119 item 8); Help also says "tap" in the hero-select steps.
- N7 (info) Parry feedback is a small gold "PARRY" word near the defender plus a ring; against SF or MvC (big spark, freeze, shout) it reads quietly. Consider a hit-stop flash and a larger word.
- N8 (info) A naive bot (walk toward the foe and fire) as Fiara on Easy against Rokcore was stun-juggled to the left wall and lost 0-2 without dealing any damage in about 190 s (`d-fight-*.png`); as Treenoc it lost one round in 24 s. A real player guards and dashes, so this is not a bug, but Easy punishes a passive player hard (same stun lock as r119 N2).
- N9 (info) Tour fight 1 shows a "Loading..." interstitial for over a second (`k-tour1a.png`) between the briefing and the arena.
