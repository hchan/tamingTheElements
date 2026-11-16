---
status: idea
added: 2026-11-16
---

# QA r73: scorecard (main 8bbac0cc, headless Playwright, screenshots in ~/claudetmp/qa-r73/)

## Scores (0-5, vs Street Fighter / MvC)

| Axis | r72 | r73 | Why |
|---|---|---|---|
| Fun | 3 | 3 | Same loop and roster (13 heroes); hits, tag swap, supers, Tour all work. Still little knockback or hitstop weight compared with SF. |
| Graphics | 3.5 | 3.5 | Super band is now a clean full-width strip with element colour and a portrait chip; stage floors, Fire/Water/Air/Earth, still strong. Earth round-intro Treenoc still pale and ghosted. |
| Readability | 3.5 | 3.5 (supers up, floor tags down a little) | Band no longer covers feet or heads in any case tested. New nits: floor tags clip at the screen edge and sit under fighters; first-run hint card overlaps the band at 844x390. |

## Checks

- Menu: exactly Play, Versus, Online, Settings, Help. PASS (menu.png, port-menu.png).
- Play picker (13 heroes, info card, "More below" cue): PASS (nav-Play.png).
- 1v1 in Fire, Water, Earth, Air (9 pairings): zero console or page errors. PASS (f-*-intro.png, f-*-fight.png).
- Tag swap 2v2: TAG! call, bench portraits with cooldown, swap works, no errors. PASS (tag-2.png).
- Super band (SUPER-BAND-1): PASS. Checked Fiara, Rokcore, Cyclonius, Treenoc, desktop near and far (sup-d-*), 667x375 (sup-p667-*) and 844x390 (sup-p844-*). The band sits in the strip under the HUD (y about 120-260 at 720p); fighters, feet and heads stay below it in every shot. Text and portrait chip move to the side away from the caster.
- Tour fight: PASS (tour-2.png, Stage 1 of 9, team strips, "3 continues left").
- Help: PASS (nav-Help.png). Portrait 390x844: menu fine, arena sits behind the Rotate overlay (port-arena1.png), same as r72.
- e2e subset (arena-smoke, app-flow, arcade-tag, arcade-super, hero-picker-layout, phone-layout; E2E_PORT=7952): 24 passed.
