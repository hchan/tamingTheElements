---
status: idea
added: 2026-11-18
---

# QA round 109 scorecard

Build: main a25cc33f (Merge Online quick match screen, ONLINE-QM). Headless Chromium + SwiftShader via the dev server (port 7941), 1280x720, 390x844 portrait and 844x390 landscape (touch, mobile). Shots in `.scratch/shots109/` (gitignored). Scored against a Street Fighter / Marvel vs Capcom feel. RUN-5 (Run box on HUD and phone bar) is not merged, so its absence is not scored.

## Overall

| Axis | Score | Note |
|---|---|---|
| Fun (SF/MvC feel) | 3.5 | Tag, super cut-in and hit numbers give a real MvC beat; long stuns steal agency |
| Graphics | 4.1 | Four stage floors are distinct and polished; hero art varies in scale and polish |
| Readability | 3.7 | Clear HUD at 1280; call-outs collide with the Weather chip; phone portrait HUD tiny |

## By area

| Area | Score | Note |
|---|---|---|
| Main menu | 4.6 | Five entries, Online gold, no banned words, art framing the column |
| Hero select (Play) | 4.2 | Slot badges, range badge with (Run Away), ability text; "More below" cue is small |
| Help, Controls | 4.3 | Run Away / Run Towards row for P1 (backquote or Tab) and P2 (slash); Gamepad and Touch tables have no Run row; "How to fight" list has no Run step |
| Key Bindings | 3.2 | Phone: page is wider than 390 and the Alternate column is clipped |
| 1v1 Fire stage | 4.0 | Lava floor strong; overlapping halos hide the heroes in a clash |
| 1v1 Water stage | 4.2 | Best floor; WATER +HP pads clear |
| 1v1 Earth stage | 3.9 | Floor is muddy and the vortex fx hides Treenoc |
| 1v1 Air stage | 3.9 | Pale floor lowers contrast with Cyclonius |
| Tag swap | 4.3 | "TAG!" call, portrait pop and 2.8 s cooldown on the card read well; swap refused while stunned shows a clear line |
| Super | 4.4 | SIREN GALE band with speed lines and element tag is a proper cut-in |
| 2v2 | 4.0 | Bench portraits with life under them, tag cooldown timer visible |
| Tour (desktop) | 4.0 | Stage card clear; its Controls block lists no Run |
| Phone landscape | 4.0 | Stick, Strike 1 and 2 with ability names, bar and HUD readable; stage text overlaps bar slot 1 |
| Phone portrait | 3.0 | Rotate overlay first; arena is a thin band, HUD text about 6 px, heroes small |

## What worked

- No banned words on menu, Play, Versus, Help, Key Bindings or the tour card; 0 page or console errors in every run.
- Help Controls has Run Away / Run Towards rows (P1 and P2) and the Play hero panel shows "(Run Away)" beside Ranged.
- Fighting stage floors differ in colour and pattern at a glance in all four elements.
- Smoke e2e: PC job lost, exit 93, no result (see findings).
