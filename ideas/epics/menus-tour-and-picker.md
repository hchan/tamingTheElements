---
status: epic
added: 2026-11-16
---

# Epic: Menus, Tour and hero picker

Main menu, hero picker, Tour screens and ladder, splash art; the first things a player sees.

- Suggested order: Picker and menu clarity first (picker bar, menu fold), then Tour HUD/ladder pin, then splash and montage art, then new modes (survival/daily/ladder).
- Size: L overall.
- Dependencies: Player-facing words: Play, Versus, Online, Settings, Help (never Classic, Arcade, ruleset or Capture).
- Owner-gated: The menu stays at five entries (owner priority).

Member ideas, in suggested priority order (work them as separate small work packages):

- [picker-followups](../brainstorm/picker-followups.md): Picker follow-ups after PB1. - PB2 (planned separately, see ~/claudetmp/plans/picker-fightbar-plan.md).
- [picker-bar-reserved-space](../in-progress/picker-bar-reserved-space.md) (in progress): Picker: the Fight / Start bar takes its own space (PB1). The picker page scrolled and the bar was position:
- [qa-menu-fold-and-tiles](../in-progress/qa-menu-fold-and-tiles.md) (in progress): QA: Versus and Play put the start button below the fold at 1280x720. At 1280x720 the Fight! button on Versus is clipped at the bottom edge and the Play roster is long enough that Start is out of view.
- [one-game-menu](../in-progress/one-game-menu.md) (in progress): One game, five-entry menu. Menu: Play, Versus, Online, Settings, Help.
- [mvc-character-select-with-ability-info](../in-progress/mvc-character-select-with-ability-info.md) (in progress): Marvel vs Capcom style character select, with abilities explained. Owner idea (2026-11-13): the main menu's character choice is a drop-down, which is ugly.
- [tour-select-screen-redesign](../in-progress/tour-select-screen-redesign.md) (in progress): Tour screen redesign: Marvel vs Capcom style select, dark fantasy. Owner feedback (2026-11-13, screenshot of #tour):
- [tour-hud-stage-number-and-continues](../brainstorm/tour-hud-stage-number-and-continues.md): Tour HUD stage number and continues count. Show the Tour stage number and the remaining continues in the fight HUD, not only on the stage card.
- [tour-ladder-roster-pin](../brainstorm/tour-ladder-roster-pin.md): Pin the roster in a saved Tour run. buildTour(hero, seed) depends on the released roster, so a roster release (RELEASED_CHARACTERS / ARCADE_RACES change) re-rolls the ladder of a saved r
- [tour-void-floor](../brainstorm/tour-void-floor.md): Tour Void stage has no void floor. The last Tour stage says "Void" on the card and "The Eternal Void" on the splash, but the fight floor is a random element:
- [qa-menu-bland](../brainstorm/qa-menu-bland.md): QA: main menu and Help are plain text buttons. Five full-width grey buttons, a tiny logo and a yellow italic title.
- [qa-r6-dead-band-and-menu-art](../brainstorm/qa-r6-dead-band-and-menu-art.md): QA r6: dead band and hard seam on every non-fight screen; menu has no key art. Seen at both 1280x720 and 1920x1080 (menu-*.png, flow-*.png in ~/claudetmp/qa6/).
- [splash-and-montage-art](../brainstorm/splash-and-montage-art.md): Splash and montage art (menu, title, Help, hero select, team select, vs, win/loss). Goal: a set of originals-style (Fiara/Treenoc look, not the scrapped grim redesigns) key-art stills and short montage sequences:
- [menu-and-graphics-animation-everywhere](../in-progress/menu-and-graphics-animation-everywhere.md) (in progress): More animation everywhere: menus and graphics, with Stable Diffusion art. Owner idea (2026-11-13): EVERYTHING, everywhere needs more animation in menus and graphics;
- [game-modes-survival-daily-ladder](../brainstorm/game-modes-survival-daily-ladder.md): More game modes: survival, daily challenge, ladder. Goal: add Survival (endless run with carried-over health), a Daily Challenge (fixed seed and modifiers per date, shareable result) and a ladder, along
