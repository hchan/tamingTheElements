---
status: idea
added: 2026-11-14
---

# QA r8: scorecard and qa-r6/r7 status

Build: main 1f2ab46f, headless Chromium (SwiftShader), 1280x720 and 390x844. Shots in ~/claudetmp/qa-r8/ (menu, help, versus picker, hero-select, fight-{fire,water,earth,air}, super-a/b/c, 2v2-picker, 2v2-fight, tag-swap-a/b, tour-*, phone-*). No console errors. e2e subset (app-flow, tour, arcade-tag, arcade-super): 16/16 passed. Never-show words (Classic, Arcade, ruleset, Capture): clean on /, help, guide, settings, versus, tour, online, wiki, about (page text, aria-label, title, alt).

## Scores (0-5 vs Street Fighter / Marvel vs Capcom)

- Fun 3: same depth (weather, traps, tag, super, snag); first seconds still passive; default Sindarosa 272 vs Pax 765 HP is still lopsided.
- Graphics 3.5 (up from 3): menu key art plus rainbow crest, element-tinted life bars, framed Glacier Crash banner. Sprites still mixed (bitmap Pax pasted on rigged heroes, no shadows).
- Readability 3 (up from 2.5): tinted bars and a SUPER label help; first-run card and floor labels still clutter.

## Status vs qa-r6 / qa-r7

- Dead band and menu key art: FIXED on menu, Help, Tour (full-bleed art, no seam at 1280x720); phone menu fills well, bottom 15% is plain gradient.
- Life bars: FIXED (element tint, rounded frame). No chip trail or low-HP colour seen (not tested at low HP).
- Pips: PARTLY fixed, now labelled "SUPER 0" with three segments; the ROUNDS circles are tiny.
- Floor labels "FIRE x2", "AIR x2", "WATER +HP": STILL OPEN, bare serif text over the floor; they collide with heroes (AIR x2 beside Pax, WATER +HP covered by Pax and the aim arrow in fight-water). Use icon-only or fade when a fighter is near.
- Floors: fire lava and water good; air pale lavender readable; earth fine. Earth teal crystal prop still flat vector with hard outline: OPEN.
- Dark heroes: Echo on the air floor still a faint swirl: OPEN (see qa-r7-hero-contrast-and-sprite-look.md).
- Versus picker: REDESIGNED (tiles, element groups, detail pane). Residual: "You: Sindarosa" card vs highlighted Curomo with "Add to team" while "1 of 1 picked" is confusing; default matchup unchanged.
- Wording: FIXED.
- First-run key hints: correct.

## New findings

- First-run "FIRST BLOOD" card (top-left) covers the buff chip row and stays through the first seconds of every fight; auto-dismiss on first input.
- Tooltip "Weather" appeared over the arena in 2v2-fight and sat on top of the TAG label above the action bar; tooltips should anchor above the button and never cover the play field.
- 2v2 bench portraits sit under the timer and overlap the SUPER pips area; crowded centre strip. The TAG caption is tiny.
- Portrait phone fight shows only a "Rotate your device" gate; "Play anyway" leads to a very small arena (not regressed, weak first impression).
- Super banner (Glacier Crash) is good but covers the lower third and hides the hit; keep it short.
- Hit numbers ("23") use a plain font with no outline; SF-style punchier numbers wanted.
