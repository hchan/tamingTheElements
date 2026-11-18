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

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [menu-cleanup](../brainstorm/menu-cleanup.md): Menu cleanup (big)
- [qa-r100-findings](../brainstorm/qa-r100-findings.md): QA round 100 findings
- [qa-r106-findings](../brainstorm/qa-r106-findings.md): QA r106 findings
- [qa-r107-findings](../brainstorm/qa-r107-findings.md): QA r107 findings

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### MT-1 Picker and menu cleanup

- Members: [picker-followups](../brainstorm/picker-followups.md), [picker-bar-reserved-space](../in-progress/picker-bar-reserved-space.md), [mvc-character-select-with-ability-info](../in-progress/mvc-character-select-with-ability-info.md), [qa-menu-fold-and-tiles](../in-progress/qa-menu-fold-and-tiles.md), [menu-cleanup](../brainstorm/menu-cleanup.md)
- Size: M
- Shared files: src/ui/* (menu, versus picker), main.css
- Flags: needs browser/e2e; menu stays five entries (menu-cleanup comes after the online flow per the owner)
- Parallel: HUD/UI lane: serial with other main.css bundles.

### MT-2 Tour screens and HUD

- Members: [tour-select-screen-redesign](../in-progress/tour-select-screen-redesign.md), [tour-hud-stage-number-and-continues](../brainstorm/tour-hud-stage-number-and-continues.md), [tour-ladder-roster-pin](../brainstorm/tour-ladder-roster-pin.md), [tour-void-floor](../brainstorm/tour-void-floor.md), [qa-r107-findings](../brainstorm/qa-r107-findings.md)
- Size: M
- Shared files: src/ui/* (tour), src/core/rules/*, main.css
- Flags: needs browser/e2e; tour-void-floor and roster pin may need SIM (check the file)
- Parallel: Serial with GM-1 and other main.css bundles.

### MT-3 Menu art and animation

- Members: [qa-menu-bland](../brainstorm/qa-menu-bland.md), [qa-r6-dead-band-and-menu-art](../brainstorm/qa-r6-dead-band-and-menu-art.md), [splash-and-montage-art](../brainstorm/splash-and-montage-art.md), [menu-and-graphics-animation-everywhere](../in-progress/menu-and-graphics-animation-everywhere.md), [one-game-menu](../in-progress/one-game-menu.md)
- Size: L
- Shared files: src/ui/*, main.css, asset manifest
- Flags: needs browser/e2e, owner art review, PC-offloadable for art generation
- Parallel: Serial with MT-1 (main.css) and manifest bundles.

### MT-4 Match-end card fixes

- Members: [qa-r100-findings](../brainstorm/qa-r100-findings.md), [qa-r106-findings](../brainstorm/qa-r106-findings.md), [qa-r107-findings](../brainstorm/qa-r107-findings.md)
- Size: S
- Shared files: src/ui/* (match end card), main.css
- Flags: needs browser/e2e (match-end specs); match-end agents may already be working: check first
- Parallel: Serial with other main.css bundles.
