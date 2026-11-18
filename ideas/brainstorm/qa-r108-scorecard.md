---
status: idea
added: 2026-11-18
---

# QA round 108 scorecard

Build: main dd5c936f (Merge Run key, Tab hotkey and Help, RUN-4). Headless Chromium + SwiftShader via the dev server (port 7941), 1280x720 and 390x844 (touch, mobile). Shots in `.scratch/shots108/` (gitignored). No e2e specs run. Scored against a Street Fighter / Marvel vs Capcom feel (readable spacing, tight inputs, clear state feedback).

## Overall

| Axis | Score | Note |
|---|---|---|
| Fun (SF/MvC feel) | 3.4 | Run Away works and reads as spacing play, but it is unsignalled and drives the hero into a wall |
| Graphics | 4.0 | Stages, hero art and HUD look good at 1280x720 |
| Readability | 3.8 | Run has no on-screen cue; phone Key Bindings clips a column |
| Run feature (new) | 3.5 | Tab and Backquote both work; discoverable in Help and hero panel, absent from bar, touch and pad |

## By area

| Area | Score | Note |
|---|---|---|
| Menu (Play, Versus, Online, Settings, Help) | 4.5 | Five entries, no banned words, Online highlighted gold with a subtitle |
| Help page | 4.2 | Run row present for P1 and P2 and in the hero panel text; Gamepad and Touch tables have no Run row |
| Settings | 4.0 | Clean sections; key rebinding is on the Key Bindings page (from Help), not Settings |
| Key rebinding | 4.0 | Run Away / Run Towards row, conflict prompt with a one-click "Move Z to ..." button, status messages work; Tab correctly refused as a bind |
| Pick screen (Play) | 4.1 | Hero panel shows "(Run Away)" or "(Run Towards)" beside the range badge |
| Match 1v1, desktop | 4.0 | HUD, round banner, action bar clear |
| Run in play (Tab) | 3.5 | Tab and Backquote hold a retreat; no HUD cue and hero ends against the arena edge |
| Phone match (390x844) | 3.2 | Rotate-to-landscape overlay first; stick plus two Strike buttons, no Run button, HUD text tiny |
| Phone Key Bindings | 2.8 | Alternate key column clipped at 390 |

## What worked

- Banned words (Classic, Arcade, ruleset, Capture) absent from menu, Help, Settings, Versus and Online at both viewports; 0 page or console errors.
- Tab held in a live match sends Run for P1; focus stays on BODY (no trap) and Tab inside the rebind prompt is ignored, not bound.
- Rebind flow: press a key, "Run Away / Run Towards is now G.", conflict offered a one-click move.
- Help Controls lists `` ` `` (backquote) or Tab for P1 and `/` for P2.

## Not done

- No real touch device, no audio, no real GPU, no online match, no 2v2 or Versus match played this round.
- Run's sim effect was judged from screenshots only (no position probe in the test hook).
