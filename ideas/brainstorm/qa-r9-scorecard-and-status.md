---
status: idea
added: 2026-11-14
---

# QA r9: scorecard and qa-r8 status

Build: main 57a6b3cc, headless Chromium (SwiftShader), 1280x720, 390x844, 844x390. Shots in ~/claudetmp/qa-r9/ (menu, versus-picker, hero-select, fight-{fire,water,earth,air}[-go,-attack], fight-lavax, super-a/b/c, 2v2-picker, 2v2-fight, tag-swap-a/b, tour-*, settings(-full), help(-full), phone-*, phone-land-*). No console errors. e2e subset (app-flow, tour, first-run-hint, arcade-tag): 13/13 passed. Never-show words: clean on /, help, guide, keybindings, settings, versus, tour, online, wiki, about.

## Scores (0-5 vs Street Fighter / Marvel vs Capcom)

- Fun 3: unchanged; default Sindarosa 272 vs Pax 765 HP still lopsided; opening seconds passive.
- Graphics 3.5: outlined bold hit numbers ("73", "23") and the TAG! pop are a real SF step; Echo now has a visible rim on the air floor; Lavax readable. Still bitmap Pax pasted on rigged heroes, flat teal crystal, no shadows.
- Readability 3.5 (up from 3): floor labels are now pill chips, first-run card moved bottom-right.

## Status vs qa-r8

- Floor labels: PARTLY fixed (pill chips, dimmer when far). Still collide: "WATER +HP" sits under the aim arrow and behind Pax in fight-water; "AIR x2" is hidden by Pax's hit number in fight-air-attack. Fade/hide chips when a fighter or arrow is within about 80 px.
- First-run card: PARTLY fixed. No longer covers the buff chips, but now covers the right 25% of the arena and the last action-bar slots for the whole opening. Needs auto-dismiss on first input, or a smaller strip.
- Hit numbers: FIXED (outlined, bold).
- Echo/Lavax contrast: FIXED/improved (rim visible; Echo still dark but readable).
- Earth crystal prop: OPEN (flat teal vector, hard outline).
- Tooltip over arena: OPEN. In every fight a "Dash" tooltip (1v1) or "Weather" tooltip (2v2, covering the TAG caption) is stuck over the play field at start with no hover; it should not show without pointer hover/focus and never over the field.
- 2v2 bench portraits: PARTLY fixed (neat under the timer with tag meter) but still crowd the SUPER pips; the TAG caption above the bar is still tiny.
- Super banner (Glacier Crash): unchanged, good but covers the lower third.
- Pips/ROUNDS circles: still tiny.
- Portrait phone fight: OPEN (rotate gate, Play anyway gives a tiny arena). Landscape phone fight works: stick, 10 buttons and card fit, but the First Blood card covers Pax and the bar's right end.
- Versus picker: AI default is now Rokcore, but the "You" card still reads "Sindarosa / Not picked yet" with "0 of 1 picked" while the detail pane shows Sindarosa with "Add to team"; the cursor is on the player hero, not the first tile (Curomo). Confusing: OPEN. Earth row is cut off under the footer until scrolled ("More heroes below" helps).
- Wording: FIXED, holds.
- Settings legends: not seen on /#settings (Difficulty, Display Size, Sort, Accessibility, On-screen buttons, Relay, Audio); Relay inputs are unstyled white boxes and the background art ends mid-page leaving a flat navy seam in the full-page view: OPEN.
- Menu: fine (key art, rainbow crest, 5 entries, version stamp).

## New findings

- Stuck tooltips are the top readability bug now.
- "FIGHT!" overlaps floor chips for the first second.
