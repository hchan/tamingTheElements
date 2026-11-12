# Accessibility

What the port does beyond the legacy game, where it lives and how it is tested. Every item is an intentional
improvement (see the V11 to V16 rows in [PARITY.md](PARITY.md)); none changes sim behaviour.

## Audits

`tests/e2e/a11y.spec.ts` runs `@axe-core/playwright` over every DOM screen (main menu with and without a save,
garrison with and without a selection, settings with high contrast on, current objectives, wiki, key bindings, about,
race and character details, defeat, victory after a real battle, story mode and new game cinematics, and the game master
in the test build) and asserts zero **serious or critical** violations. Fixes that audit forced: page background and
colours that meet WCAG AA contrast (the stylesheet had no background, so yellow headings and white links sat on white),
`h1` headings, a `<main>` landmark, real `<button>` and `<a>` controls, a labelled game-master textarea, `lang="en"`
and a per-screen `document.title` (`routeTitle` in `src/ui/router.ts`).

## Keyboard

- Main menu entries, garrison actions, settings controls and Back links are native buttons, links and form controls, so
  Tab order is DOM order and Enter or Space activates. Disabled entries are real `disabled` buttons and are skipped.
- Garrison rows are `role="button"` with `aria-pressed`; Enter or Space toggles, and focus stays on the row after the list
  re-renders. The garrison now has a Back link (it had none).
  Garrison rows show the battle order as text (`Slot 1`..), and a `Slot 1..3` strip names who fills each slot or says `Empty`
  (dashed border), so a selection is never only a colour. Avatars and element icons are decorative (`aria-hidden`); the
  element and name are text. On small canvases the Phaser HUD labels, key labels, Capture hint and Skip scale up (`phoneBoost`).
- Every screen except the main menu, battle, cinematics and results goes back on **Escape** (`backHash`,
  `src/ui/keyboard.ts`). Space also activates a focused link. Escape is left alone inside text fields, inside the pause
  dialog and while a key is being captured for rebinding.
- After each navigation the new screen's `h1` takes focus, so the screen is announced and Tab starts at the top.
- `:focus-visible` draws a 3 px outline on every control (4 px white and amber in high contrast).
- No keyboard traps: Tab leaves key capture, and the only modal (pause) cycles Tab inside it and closes on Escape.
- Arcade Versus (`#arcade`, on for everyone): the picker is five labelled native selects in Tab order (Team:
  1v1 or 2v2 tag team; your race; your partner, disabled and out of the Tab order and the form data in 1v1; AI race;
  AI level; each race named with its element word, never by colour or art alone), a Fight! button and a Back link,
  and Escape goes back from it. Picker, battle and results share one route, so the route's `backHash` is null (Escape
  in the battle never leaves it) and the screen moves focus to each view's `h1` itself. The battle has a pointer-only
  Super button (bottom right, a 72 px square, out of the Tab order: keyboards press X) that holds the bound super key while
  pressed. The picker and results are in the axe audit of `tests/e2e/arcade.spec.ts`, which also checks the 390x844
  layout (no sideways scroll, 44 px controls).

Tested by `tests/e2e/keyboard.spec.ts`, which completes menu to garrison to battle to pause dialog to main menu with the
keyboard alone.

## Settings

Settings has an **Accessibility** group.

| Option | Default | Effect |
|---|---|---|
| Reduce motion | `prefers-reduced-motion` | Drops screen shake, hit particles and the Arcade hit-stop jitter (`EventFx`; Arcade shows one static 100 ms spark instead of particles), replaces cinematic spins and moves with an instant change plus a short cross-fade (`planTween`), shows the portal embers as one still frame, and turns off CSS animation and smooth scrolling (`html[data-reduce-motion]`). Information stays: the Arcade round banners (they appear at full size instead of scaling in over 600 ms; the text, the timer and the pips are unchanged), the hit flash (white for 2 frames, then a tint for 4; no motion), Arcade damage numbers (they fade in place instead of floating up), the combo counter (no pop; it stays 1 s after the combo) and the hyper meter (a full meter stays steady instead of pulsing once a second). The Arcade super cinematic drops its motion and keeps its information: no band slide (the band fades in over 150 ms) and no camera punch-in, while the 40% dim, the element band with the caster's portrait, the super name and the element word stay for the whole freeze. |
| High contrast | `prefers-contrast: more` | Stronger borders and focus rings, solid text colours, and the colour-blind-safe HUD palette below. |

Both are saved as optional booleans in the v1 save (`reduceMotion`, `highContrast`). A missing field means "follow the OS",
re-read live, and a choice equal to the OS value is stored as missing, so a player who never overrides anything keeps
following the OS. Pure logic: `src/game/platform/a11y/prefs.ts` (`resolvePrefs`, `applyPrefsToSave`). See
[SAVE-FORMAT.md](SAVE-FORMAT.md). The prefs are applied to `<html>` as `data-reduce-motion` and `data-high-contrast` at
start-up (`initAccessibility` in `src/game/app/main.ts`) and whenever Settings saves.

## Colour-blind-safe HUD

Health is never shown by colour alone (`src/game/hud/bars.ts`, `buffs.ts`, drawn by `src/game/scenes/Hud.ts`):

- Each side shows a text cue next to its bar: `100% OK`, `40% HURT` (below 50%), `20% LOW` (25% and below).
- The bar stroke changes pattern with the state: solid, long dashes, short dashes (`healthCue`, `dashSegments`).
- Status icons carry a plus (buff) or a cross (debuff) in addition to green or red.
- High contrast swaps the green to red ramp for an Okabe-Ito set (sky blue, yellow, vermillion) and adds white outlines.
- Arcade damage numbers (`src/game/hud/arcade-hud.ts`): combo-scaled hits are grey and smaller, counter hits gold and
  labelled `COUNTER`; the combo counter is text (`3 HITS`, `46 DMG`) with a black outline.
- Arcade hyper meter: the bar count is a number beside the bar (`3 MAX` when full); full segments are solid and the one
  still filling is dashed, with a black and white outline that reads on bright and dark arenas (high contrast: white fill,
  thicker outline). A full meter pulses once a second, under the WCAG 2.3.1 limit of three flashes.
- Arcade 8-way aim (`src/game/fx/aim-view.ts`): the cast direction is a white arrow with a dark outline beside the
  player's character, so it reads by shape and position on bright and dark arenas, not by colour. It has no animation
  (it snaps to the new aim), so reduced motion keeps it as it is.
- Arcade rounds (`src/game/hud/round-view.ts`): the round timer is a number (white with a black outline; from 10 s left
  it turns light red, an extra cue only), and the round-win pips beside it are filled when won and hollow when still to
  win, so they read by shape (high contrast: white fill). The announcer banners are words ("ROUND 1", "FIGHT!", "K.O.",
  "PERFECT", "TIME", "YOU WIN ROUND 1", "VICTORY"), never a colour or a sound alone.
- Arcade defence (`src/game/fx/defence-view.ts`, WP-arcade-defence-view): a guarding fighter is inside a bubble with a
  white rim (thicker and opaque in high contrast), and its guard bar under it reads by length and its quarter notches
  (pale blue, orange at 30% or less, an extra cue only); it shows only while guarding or refilling. A parry, a guard break
  and a perfect dodge each pop a word over the fighter ("PARRY", "GUARD BREAK", "DODGE") with a ring. The parry flash is
  a 120 ms white disc over the fighter, not a full-screen flash. Reduced motion keeps the shield, bar, words, rings (static,
  not growing), the flash and one static spark per hit, and drops the dash afterimages, projectile trails, flying sparks and
  shards and the rising words (FUN-DESIGN section 3).
- Arcade trap (WP 39b): Z or 0, pad Y, P2 M, or the touch Trap button (cooldown in seconds). Each trap on the floor carries its words ("P1 Fire Bomb (arming)"), never colour alone; reduced motion stops the end-of-life blink (`tests/e2e/arcade-trap.spec.ts`).
- Arcade charge (WP-arcade-charge, FUN-DESIGN 2.17): H, pad R3 or the touch Charge button. A charge pops "CHARGE!" over the fighter and says "You charged." or "The enemy charged." in the live region; the arrival hit sparks like any hit. Reduced motion keeps the word and the line and drops the afterimages (`tests/e2e/arcade-charge.spec.ts`).
- Arcade weather (`src/game/fx/weather-view.ts`, WP-arcade-weather-view): the weather up is a HUD badge with a glyph that
  differs by shape (sun with rays, drops, blown sand, wind lines, an eclipsed sun), a word and the whole seconds left
  (`RAIN 9`), and a time bar that reads by length and a notch every 2 s; its colour is an extra cue only (high contrast:
  an opaque plate and a white bar outline). The label grows up to 1.4x on a phone. A cast also shows its name as a line
  ("Sunshine!", "Rain!", "Sandstorm!", "Gale!", "Eclipse!") for 1.5 s. Reduced motion keeps the badge, the line (at full
  size, no scale-in) and a steady sky tint, and drops the particles and the tint fade (FUN-DESIGN 2.14 and section 3).
  The weather charge chip (WP-arcade-weather-charge) under the badge says `WEATHER 60%` and then `WEATHER READY`, so it reads
  as text and by the bar's length and quarter notches, not by colour; READY adds a white border that blinks, steady with
  reduced motion; high contrast uses an opaque plate and a white bar outline.
- Arcade 2v2 tag team (`src/game/hud/tag-view.ts`, WP-arcade-tag-view): under each side's bars, words say who is in
  ("IN Sindarosa") and the bench's state ("BENCH Pax 40% +20% red", "BENCH Pax K.O."); the active bar has a gold frame
  (white and thicker in high contrast) and the red life (the rest cap above the health, which a benched hero wins back)
  is drawn as dashes over the grey rest stroke, so it reads by pattern and word, not colour (high contrast: Okabe-Ito
  reddish purple). The tag cooldown is a bar that fills with dashes and turns solid when ready, beside its word ("TAG
  2.4s", "TAG READY", "NO TAG" once the partner is down); the lines grow up to 1.3x on a phone. A "TAG" caption sits over
  the player's swap slot on the action bar. A tag shows "TAG!" (a KO entrance the incoming name, "PAX IN!", in gold) on
  the tagging side for 1.2 s and an entrance flash at the spot (white core, ring, speed lines from the team's side; a
  double gold ring after a KO). Reduced motion keeps the words, the call at full size (no scale-in), the flash and a
  static ring, and drops the slide and the ring's growth.
- Arcade clash (`src/game/fx/clash-view.ts`, WP-arcade-clash): two projectiles that meet show a ring at the meeting
  point with a dark rim, so it reads on light and dark arenas; the winner's element colour is the inner, thicker ring and
  the loser's the outer one, and a cancel (both destroyed) adds a white core, so the outcome reads by shape as well as
  colour (and by which projectile flies on). Reduced motion keeps the ring at full size (no growth), still fading. A clash
  has no live-region line: it is frequent, and its outcome shows in the HP and meter read-outs.
- Arcade audio layers (`src/game/audio/arcade-audio.ts`, WP-arcade-audio-layers): every synthesised cue doubles
  something already on screen or in the live region, so nothing is told by sound alone: the hit thump and combo tick
  (flash, sparks, damage number, `N HITS`), the guard thud, parry ping, guard break crack and dodge (bubble, words
  "PARRY", "GUARD BREAK", "DODGE" and their live lines), the dash whoosh (afterimages; reduced motion keeps the sound),
  the clash clang (the ring), the super charge (the cut-in), the weather stingers (badge, called line, live line) and the
  round stingers and KO music cut (the banners and their live lines). They play on the sfx bus, so Ctrl-M mutes them
  with everything else; reduced motion does not silence them. Nothing plays before the first key press or tap, or while
  the tab is hidden. The cues are short (0.7 s at most), and no more than ten synth voices sound at once (round
  stingers excepted).

## In-battle announcements and pause

`src/game/a11y/announcer.ts` feeds two visually hidden live regions created while a battle runs: `#liveRegion`
(`role="status"`, polite) and `#liveRegionAssertive` (`role="alert"`). It announces match start, win, lose and draw, hero
and enemy deaths, capture and failed capture, and low health (once at 25% or less, re-armed after recovering above 40%).
Hits and movement are silent. Throttle: at least 1.5 s between lines, the same line not repeated within 6 s, at most 3
waiting lines, and match start or end go out at once with any waiting line folded in.

Arcade rounds (WP-arcade-announcer-view) add their lines through the same throttle (`RoundAnnouncer` in
`src/game/hud/round-announcer.ts`): "Round 1." (or "Final round." at 1-1) when a round starts; "Fight!", the KO ("K.O.
You knocked out the enemy.", "K.O. You were knocked out.", "Double K.O.", plus "Perfect." when it was one) and "Time
over." go out at once (assertive) with any waiting line folded in; the round result ("You win round 1. Rounds 1 to 0.")
is polite; the match end line carries the round score ("Victory. You won the match. Rounds 2 to 1."). Each line's key
includes the round number, so the 6 s repeat filter never swallows the next round's "Fight!".

The Arcade defence view (WP-arcade-defence-view) adds polite lines through the same throttle: "You parried." or "The
enemy parried." on a parry, "Your guard broke." or "Enemy guard broken." on a guard break (`LINES` in
`src/game/fx/defence-fx.ts`); the 6 s repeat filter keeps a parry chain from flooding the reader. Dashes, guarded hits and
perfect dodges are silent, like hits.

The Arcade weather view (WP-arcade-weather-view) adds polite lines that say who called which weather and what it does:
"You called Rain: water hits harder, fire softer.", "The enemy called Eclipse: void hits harder.", "You renewed the
Sunshine." on a recast, and "The Gale is over." when it ends (`changedLine` and `endedLine` in
`src/game/fx/weather-fx.ts`). Their keys include the weather and the side, so a quick counter-weather is not swallowed
by the 6 s repeat filter.

The Arcade terrain view (WP-arcade-terrain-view) says "The stage will turn to fire." when a weather cast starts the 30-tick swap,
"The stage turns to fire." when it lands, "You stand on a fire patch: damage doubled." when the player's hero steps on a patch of
its element and "Rock blocks the shot." when a rock stops a projectile (`src/game/fx/terrain-fx.ts`). Each patch has its own pattern
(flames, waves, bricks, swirls) and a word (FIRE x2, WATER +HP, ROCK, AIR x2), so no cue is colour alone; the buff badge is an icon
plus text. Reduced motion drops the particles, the glow pulse and the fades.

The Arcade tag view (WP-arcade-tag-view) adds polite lines: "Tag! Pax is in, Sindarosa rests." or "The enemy tagged in
Lavax." on a tag, "Sindarosa is down. Pax steps in." or "Enemy Fiara is down. Lavax steps in." on a KO entrance (after
the base "Your elemental was defeated." line; `tagLine` in `src/game/hud/tag-fx.ts`). Keys differ per side and kind.

Pause (Shift+P, gamepad Start, or the Resume button) opens a `role="dialog"` with `aria-modal`, moves focus to Resume,
cycles Tab inside (`nextFocusIndex`), closes on Escape, restores the previous focus and drops held keys so a key held
across the dialog is not replayed (`src/game/a11y/pause-dialog.ts`).

## Key bindings and gamepad

The Key Bindings screen lists every action with a key and an alternate key. Choose one, press the new key: Escape
cancels, Backspace clears an alternate, reserved keys (Escape, Tab, modifiers) are refused, and a key already used by
another action is reported with a **Move** button instead of being taken silently. **Reset to defaults** restores
everything. Bindings live in the save as `keyBindings` (all actions, written only when they differ from the defaults) and
are sanitised on read (`parseBindings`). Pure model: `src/game/platform/input/bindings.ts`; `KeyboardAgent` reads it when
a battle starts.

Gamepad (Gamepad API, standard mapping) maps to the same `Command` bits as the keyboard
(`src/game/input/gamepad.ts`, polled by `KeyboardAgent.observe`): left stick or d-pad moves (deadzone 0.4), A is the
primary and B the secondary ability, Y captures (only when capturable), LB, RB, LT and RT swap, Start pauses. Pad button
remapping is not offered; browsers expose a pad only after its first button press.

Arcade super (FUN-DESIGN 2.5): the **Super (Arcade)** action, plain X by default (Shift-X stays the tester cheat), and pad
RT send `Cmd.super` only in an Arcade match (`KeyboardAgent` option `arcade`, `ARCADE_PAD`); in Classic the key sends
nothing and RT stays the fourth swap. The super key is rebindable with the same conflict check as every action. A save
written before the action existed keeps the player's keys: if one of them is already X, the super is left unbound
(shown as None) instead of resetting the map.

Arcade dash and guard (FUN-DESIGN 2.7, 2.8; WP-arcade-defence-view): the **Dash (Arcade)** action is plain E and the
**Guard (Arcade)** action plain Q (hold to guard, press to parry; Shift-Q stays the tester cheat), pad RB dashes and LT
guards. Like the super, they send `Cmd.dash` and `Cmd.guard` only in an Arcade match; in Classic the keys send nothing and
RB and LT stay the second and third swap (an Arcade team has one partner, tagged on LB). Both are rebindable with the
conflict check, and a save that already uses E or Q leaves the new action unbound rather than resetting the map. A double tap of a direction
dashes too (the sim reads it from the direction presses). On touch screens, Guard and Dash buttons sit above the Super
button on the right edge (each a 72 px square, 48 px at least, 6 px apart; the on-screen row is the numbered action row); each holds the action's first bound key while the finger
is down (a pointer-only control: keyboards press the key, so they are not in the Tab order); an unbound action's button
does nothing.

Arcade weather (FUN-DESIGN 2.14; WP-arcade-weather-view): the **Weather (Arcade)** action is plain R and pad X calls it
(X has no Classic mapping, so no Classic button changes). It sends `Cmd.weather` only in an Arcade match; it is
rebindable with the conflict check, and a save that already uses R leaves it unbound. A touch Weather button sits above
the Dash button, like the others.

Arcade tag (FUN-DESIGN 2.6; WP-arcade-tag-view): in a 2v2 Arcade Versus match the tag is the first swap, unchanged from
Classic: the **Swap 1** action (key 3, rebindable) and pad LB (`ARCADE_PAD` keeps it; RB, LT and RT are Arcade's dash,
guard and super). In the match it is labelled Tag: the "TAG" caption over the swap slot, the HUD's tag word, the picker's
text and a touch **Tag** button above Weather (2v2 only) that holds the Swap 1 key. The key-binding screen keeps the
Classic name, so Classic menus are unchanged.

## Tests

| What | Where |
|---|---|
| axe audit of every screen | `tests/e2e/a11y.spec.ts` |
| keyboard-only navigation, focus, Escape, Space, no traps, pause dialog | `tests/e2e/keyboard.spec.ts` |
| reduce motion (OS default, opt out, opt in, no shake), high contrast, rebinding, gamepad pause, announcements | `tests/e2e/a11y-features.spec.ts` |
| hit feedback with reduced motion: flash, damage numbers, combo and meter stay, no shake (Arcade); fake-sink rules (static spark, no jitter); meter number, pattern and pulse rate | `tests/e2e/arcade-juice.spec.ts`, `src/game/fx/event-fx.test.ts`, `src/game/hud/arcade-hud.test.ts` |
| super cinematic: reduced motion drops the slide and punch-in and keeps dim, band and name (plan, fake sink and browser); Arcade-only super key and pad RT, binding and pad conflicts | `src/game/fx/super-cinematic.test.ts`, `tests/e2e/arcade-super.spec.ts`, `src/game/input/arcade-bindings.test.ts` |
| Arcade Versus picker and results: axe, heading focus, Escape back, touch Super button, 390x844 layout; the 8-way aim arrow | `tests/e2e/arcade.spec.ts`, `src/game/fx/aim-view.test.ts` |
| Arcade round announcer: every round event gives a banner and a live line (fake sink), reduced motion keeps the text without the scale-in, live-region lines in the browser, pips by shape, 0 listeners after leaving | `src/game/hud/round-announcer.test.ts`, `src/game/hud/round-view.test.ts`, `tests/e2e/arcade-rounds.spec.ts` |
| Arcade defence view: every defence event of real duels gives an effect (fake sink, both motion settings), reduced motion drops only motion, parry and guard-break lines, shield and bar by shape; E, Q, pad RB and LT Arcade only, binding conflicts and old saves; touch Guard and Dash buttons; 0 listeners after leaving | `src/game/fx/defence-fx.test.ts`, `src/game/fx/defence-view.test.ts`, `src/game/input/arcade-bindings.test.ts`, `tests/e2e/arcade-defence.spec.ts` |
| Arcade terrain view: every terrain event gives its feedback (fake sink), a distinct pattern and word per element (not colour alone), reduced motion drops only particles, glow pulse and fades, buff badge, live lines, 0 listeners after leaving | `src/game/fx/terrain-fx.test.ts`, `src/game/fx/terrain-view.test.ts`, `tests/e2e/arcade-terrain.spec.ts` |
| Arcade weather view: every weather event (each kind, new, replaced, renewed, ended) gives its feedback (fake sink), reduced motion drops only the particles and motion, badge by glyph, word, seconds and notched bar, live lines; R and pad X Arcade only, binding conflicts and old saves; touch Weather button; 0 listeners after leaving | `src/game/fx/weather-fx.test.ts`, `src/game/fx/weather-view.test.ts`, `src/game/input/arcade-bindings.test.ts`, `tests/e2e/arcade-weather.spec.ts` |
| Arcade tag view: team lines, red life by dashes and words, tag cooldown bar and word, TAG! and KO-entrance calls, live lines, reduced motion keeps the call at full size and drops the slide; the picker's Team and partner (Tab order, disabled in 1v1); key 3 and the touch Tag button; 0 listeners after leaving | `src/game/hud/tag-fx.test.ts`, `src/game/hud/tag-view.test.ts`, `tests/e2e/arcade-tag.spec.ts` |
| Arcade clash burst: every `clash` gives one burst (fake sink), winner colour on top, cancel core, reduced motion keeps a static ring; one pooled Graphics, 0 listeners after leaving | `src/game/fx/clash-fx.test.ts`, `src/game/fx/clash-view.test.ts` |
| prefs, bindings, motion planner, gamepad mapping, HUD cues, announcer, focus trap, menu key rules | `src/game/platform/a11y/prefs.test.ts`, `src/game/platform/input/bindings.test.ts`, `src/game/fx/motion.test.ts`, `src/game/input/gamepad.test.ts`, `src/game/hud/hud.test.ts`, `src/game/a11y/a11y.test.ts`, `src/ui/keyboard.test.ts` |

## Not done

Moderate and minor axe findings are not gated. There is no text-scaling control beyond Display Size, no separate
volume controls, no gamepad button remapping, and the Phaser canvas itself is not exposed to assistive technology (the
live regions and the HUD text cue stand in for it). The setting that hides Arcade damage numbers (FUN-DESIGN section 3) is
not built yet; hits, combos and supers are not announced in the live region (round events are) (the super's name and element are on screen,
and its start has a sound).
