# QA r113 scorecard

status: done
added: 2026-11-18
triaged: d (duplicates qa-r113-findings.md; phone-heavy, phone/portrait work dropped 2026-11-18)

Build: main at c9ff2bad (`Merge fight HUD phone text`), dev server in test mode, headless Chromium with SwiftShader, `?manual=1&seed=7&ff=arcade`.
Screenshots: `.scratch/qa-r113/<viewport>-<shot>.png` with viewport = `desk` (1280x720), `p390` (390x844), `p360` (360x640), `land` (844x390).
Not played by hand: this is stepped play (manual ticks), so feel is judged from frames, not live input.

## Covered

Menu, Versus hero select, 1v1 on all four stages (`*-fight-fire|water|earth|air.png`), tag swap (`*-tagswap.png`), super (`*-super.png`, desk, p390, land),
2v2 (`*-2v2.png`, `*-2v2-picker.png`), Tour intro and card (`*-tour-intro.png`, `*-tour-card.png`), Help (`*-help.png`), all four viewports.
The gamepad Run button (Home, "Run Away / Run Towards") was checked in the Help controls table source and its unit test only; no pad was attached.

## Scores 0-5 (vs Street Fighter / Marvel vs Capcom)

| Area | Fun | Graphics | Readability | Note |
| --- | --- | --- | --- | --- |
| Desktop 1280x720 fight | 3.5 | 3.5 | 4 | Clean SF-style HUD, super cut-in band reads well; sprites are static paintings, no hit-stop visible in a still. |
| Landscape phone 844x390 | 3 | 3 | 3.5 | HUD is clear; Pause and Strike buttons sit outside the canvas on the right, first-run card covers the left of the arena. |
| Portrait 390x844 | 2.5 | 2.5 | 3 | HUD text now big and readable; but about 40 percent of the screen is empty sky and fighters are small. |
| Portrait 360x640 | 2.5 | 2.5 | 2.5 | Name truncates ("SINDA..."), otherwise as 390. |
| Menu (all viewports) | 3 | 4 | 4 | Strong key art; portrait row alignment still off (finding 1). |
| Versus picker | 3 | 3 | 3 | Dense, lowercase role and element labels; works. |
| Tour card | 3.5 | 3 | 4 | FIGHT is pinned at the bottom as intended. |
| Help | 3 | 3 | 4 | Chips wrap cleanly; text is large and readable. |
| 2v2 and tag | 3.5 | 3 | 3 | Bench portraits and TAG call good; tiny tag timers in portrait. |
| Super | 4 | 3.5 | 4 | Cut-in band is the best moment of the game; caster can be off-screen in portrait. |

Overall: fun 3.4 / graphics 3.2 / readability 3.5 (SF2 and MvC would be about 5 / 5 / 5).

## Verified recent changes

- Portrait menu: the label sits above the subtitle; the Tour card pins FIGHT to the bottom edge at 390x844 (`p390-tour-card.png`) and in landscape. Verified.
- Larger portrait fight-HUD text: names and SUPER read at arm's length at 390 (`p390-fight-fire.png`); at 360 a name truncates (finding 3).
- Gamepad Run button: documented in Help controls; not exercised with a pad.
- Menu phone-row alignment: NOT fully fixed, Settings and Help still differ in height and top edge (finding 1).
- `pnpm e2e:smoke`: see the end of `qa-r113-findings.md` (result line).
