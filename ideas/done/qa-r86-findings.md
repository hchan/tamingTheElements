---
status: done
triaged: superseded (portrait/touch dropped; Help item fixed)
added: 2026-11-16
---

# QA r86 findings

Round r86 on main 7b14dd91 (after WP5 touch targets and the ideas cleanup). Headless Chromium, seed 7, shots in `.scratch/r86/` (gitignored, per worktree). No code changed. Covered: menu, Versus picker, Fire 1v1 fight, touch bar, Help at 390x844 (touch, deviceScaleFactor 2) and 1280x720.

## Changes since r85

- Portrait bar is now two rows of 48px tiles (row 2: Blast, Flame, Melee, Weather, Dash, Guard, Super, Bomb; row 1: Ember, Cleanse). r85 P2 (targets under 44px) is largely resolved for the bar.
- Melee (Charge) now shows as a dimmed tile for a ranged hero instead of a dead slot. r85 P3 is partly addressed.

## Ranked findings

### P1. Help says the Charge button hides for ranged heroes, but the bar shows a dimmed Melee tile
Help, "How to fight": "Charge. Melee heroes lunge at the foe. Ranged heroes have no charge, so the button hides." With Sindarosa (ranged) the bar, on both phone and desktop, shows a greyed Melee tile on key 5.
Shots: `.scratch/r86/p390-4-fight.png`, `.scratch/r86/d1280-5-fight2.png`.
Fix: change the Help line to "shows greyed out", or hide the tile again. Pick one and pin it with a test.

### P2. Portrait bar row 1 is mostly empty
Row 1 holds Ember and Cleanse at the far left; the other 8 tile widths are blank dark space directly above the live row. It wastes about 48px of height that the arena could use.
Shot: `.scratch/r86/p390-4-fight.png`.
Fix: move Ember and Cleanse into row 2 spare slots, or centre or right-align row 1, or collapse the row when only two tiles are present.

### P3. Blast and Flame tiles duplicate the Strike buttons
Tiles labelled 1 Blast and 2 Flame sit in the bar and are also the Strike 1 and Strike 2 circles. Two ways to do the same thing on a phone, with different names, is confusing ("Strike 2" versus "Flame").
Shot: `.scratch/r86/p390-4-fight.png`.
Fix: name the circles after the hero's attacks or hide tiles 1 and 2 in portrait. Not verified this round: whether tapping the tiles fires.

### P4. Intro frame shows no backdrop on 390x844
During "ROUND 1" the upper 40% of the canvas is a blank brown gradient with no crowd or mountains, and the ground is flat dark with no lava glow. The art appears only after the first steps. Same family as r85 P6, still visible in the live intro, not just tick 0.
Shot: `.scratch/r86/p390-3-intro.png`; compare `.scratch/r86/p390-4-fight.png`.
Fix: draw the backdrop and lava layers before the intro banner.

### P5. Help jump chips eat the phone screen
At 390 the "Jump to" chips wrap to nine rows and fill about 60% of the first screen; the actual "How to fight" text starts at the bottom edge.
Shot: `.scratch/r86/p390-6-help.png`.
Fix: a horizontally scrolling chip row, a two-column grid, or a collapsed "Jump to" select.

### P6. HUD sub-lines tight and small at 390
The SAFE chips sit directly under the name bars and overlap the WINS pips' row; "Life" text is dropped but the names and numbers are about 11px. The first-run card ("FIRST BLOOD") sits on the sky and covers the fighters' headroom, which is fine, but the Got it button must be tapped to clear it.
Shots: `.scratch/r86/p390-3-intro.png`, `.scratch/r86/p390-4-fight.png`.
Fix: stack the chip under its own bar with a gap; consider auto-dismiss on first move.

### P7. Fighters small on the tall phone, Fire ground low contrast
Sindarosa is about 55 CSS px wide on a 390px screen. On desktop the red dragon on orange-brown cracked ground still blends (r85 P7, carried).
Shots: `.scratch/r86/p390-4-fight.png`, `.scratch/r86/d1280-5-fight2.png`.

### P8. Not checked this round
Tap-to-fire on the bar tiles, 2v2 and 3v3 portrait, Tag buttons, the Super cut-in and the Tour at 390. Carry over from r85 P8. No e2e run.

## Passed

- Menu shows exactly Play, Versus, Online, Settings, Help at 390 and 1280. No Classic, Arcade, ruleset or Capture text appears in the menu, picker or Help text read.
- Versus picker at 390 is clean: roster by element with ranged and melee icons, P1 badge, Fight and Back pinned.
- Touch controls laid out: stick 138px, Strike circles 64px, Pause 58x44, fullscreen at the top right. No overlap with the bar.
- Desktop 1v1: single-row bar of 10 tiles, FIRE x2 hazard chips, first-run hint with real key names. No console or page errors.

## Triage 2026-11-21 (code-checked)

Fixed: P1 Help vs Charge tile (Help now says dimmed, verified r87). Dropped (phone/portrait/touch): P2 to P6, P8. Art only, tracked: P7 Fire ground contrast (`ideas/brainstorm/qa-r128-fire-stage-hero-blend.md`).
Open: none.
