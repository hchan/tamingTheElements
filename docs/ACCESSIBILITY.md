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
- Arcade Versus (`#arcade`, opt-in in Settings > Preview): the picker is three labelled native selects (your race, AI
  race, AI level; each race named with its element word, never by colour or art alone), a Fight! button and a Back link,
  and Escape goes back from it. Picker, battle and results share one route, so the route's `backHash` is null (Escape
  in the battle never leaves it) and the screen moves focus to each view's `h1` itself. The battle has a pointer-only
  Super button (bottom right, 72x48 px, out of the Tab order: keyboards press X) that holds the bound super key while
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
RB and LT stay the second and third swap (Arcade Versus is 1v1). Both are rebindable with the conflict check, and a save
that already uses E or Q leaves the new action unbound rather than resetting the map. A double tap of a direction
dashes too (the sim reads it from the direction presses). On touch screens, Guard and Dash buttons sit above the Super
button on the right edge (each 72 x 48 px or more, 8 px apart); each holds the action's first bound key while the finger
is down (a pointer-only control: keyboards press the key, so they are not in the Tab order); an unbound action's button
does nothing.

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
| prefs, bindings, motion planner, gamepad mapping, HUD cues, announcer, focus trap, menu key rules | `src/game/platform/a11y/prefs.test.ts`, `src/game/platform/input/bindings.test.ts`, `src/game/fx/motion.test.ts`, `src/game/input/gamepad.test.ts`, `src/game/hud/hud.test.ts`, `src/game/a11y/a11y.test.ts`, `src/ui/keyboard.test.ts` |

## Not done

Moderate and minor axe findings are not gated. There is no text-scaling control beyond Display Size, no separate
volume controls, no gamepad button remapping, and the Phaser canvas itself is not exposed to assistive technology (the
live regions and the HUD text cue stand in for it). The setting that hides Arcade damage numbers (FUN-DESIGN section 3) is
not built yet; hits, combos and supers are not announced in the live region (round events are) (the super's name and element are on screen,
and its start has a sound).
