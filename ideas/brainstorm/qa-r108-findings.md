---
status: idea
added: 2026-11-18
---

# QA round 108 findings

Build main dd5c936f. Headless Chromium, 1280x720 and 390x844. Ordered by value.

## 1. Run has no on-screen cue (medium)

Holding Tab or Backquote makes Sindarosa retreat, but nothing in the HUD or action bar says Run is active or even exists: the bar shows 1-9, 0, -, = only. In an SF/MvC feel a movement state (like a backdash or run) needs a visible beat. Ideas: a small Run slot in the bar (greyed while up), a short dust or speed-line trail, and a "RUN" tag in the status chip row where SNAGGED and SAFE appear. Also the tour card's CONTROLS block lists Move, Strike, Special, Snag, Dash, Guard, Super, Tag but not Run, so a new player never meets it before Help.

## 2. Run Away drives the hero into the wall (medium)

Seeds 21 and 33, Stage 1: after a 1.4 s Tab hold Sindarosa sat in the far top-left corner, partly clipped by the screen edge, with the foe left alone mid-arena and no escape space. Run Away for a ranged hero is useful only if it stops with room to turn; consider stopping at a margin from the wall, or a brief slowdown near it, so it reads as kiting and not self-cornering. (Seed 11 was ambiguous: the hero was snagged and rooted at the time.)

## 3. Touch and gamepad have no Run (medium)

Phone match shows a stick plus Strike 1 and Strike 2 only, and the 12-slot bar has no Run button. Help's Touch and Gamepad tables have no Run row either (only the P1 and P2 keyboard tables do). Either add a Run button (or a double-tap-direction) and a pad binding, or say in Help that Run is keyboard only. Tab, the fast key, is also unavailable on touch.

## 4. Phone Key Bindings clips the Alternate key column (low-medium)

At 390x844 the table header reads "Alter / key" cut at the right edge, and alternates show as "Spa", "Ent", "Non" (Space, Enter, None clipped). The page has no horizontal scroll cue. Make the table scroll with a cue, stack key and alternate per row, or shrink the key buttons. Run Away / Run Towards is a long label and wraps the same way.

## 5. Phone match starts on the rotate overlay (low)

On a portrait phone the tour starts under "Rotate your device to landscape" with a Play anyway button; the match is paused at tick 0 until it is pressed. This is intentional, but the FIGHT screen could say so earlier, and the portrait HUD text (names, super percent, WINS) stays very small at 390 wide.

## 6. Rebinding details (low)

- Run key lives on Key Bindings, reached from Help; Settings has no pointer to it. A "Key Bindings" row in Settings would help.
- Default Run key is Backquote, a corner key that is awkward on many layouts; Tab is easier but undocumented in the rebind page (the Help row names it, the bind row does not). One line under the Run row ("Tab also runs, fixed") would remove the confusion.
- Pressing Tab while the Run row listens keeps listening with no message; fine, but a "Tab is reserved" note would avoid a silent no-op.

## 7. Menu and copy (info)

Menu is clean: Play, Versus, Online (gold, "Play a friend online"), Settings, Help; no banned words anywhere checked. The version line (v0.1.0, commit hash) shows at the bottom of the main menu in dev builds; confirm it is meant for players.

## Reproduction

`corepack pnpm exec vite --port 7941`, Playwright Chromium with SwiftShader flags, `/?seed=21`, Play, Start tour, FIGHT, hold `Tab` for 1.4 s, screenshot. Rebind page at `#keyBindings`.
