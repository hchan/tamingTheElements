---
status: idea
added: 2026-11-16
---

# QA r80: findings (main d38905bf)

Screenshots in ~/claudetmp/shots/r80/ and ~/claudetmp/qa-r80/. Scripts: ~/claudetmp/qa-r80/*.cjs (play.cjs, misc.cjs, dmg.cjs, port.cjs, menu.cjs).

## Verification of r79 items

| Item | Result | Evidence |
|---|---|---|
| 568x320 fullscreen toggle over the hit counter | Fixed: "3 HITS / 66 DMG" fully readable, toggle and Pause sit to its right | qa-r80/dmg-p568-3.png |
| 568x320 WINS gap | Improved: the two WINS groups are separate, labels still tiny but not merged | qa-r80/dmg-p568-3.png |
| 844x390 HUD | Clean; toggle and Pause clear | qa-r80/dmg-p844-3.png |
| Portrait fight | Still open (below) | qa-r80/port-fight.png |
| "Play anyway" | Present as a button, overlay works at 390x844 | qa-r80/dmg-port390-3.png |

## Play-through evidence

- Four stages at 1280x720 (fire Sindarosa, water Curomo, earth Rokcore, air Echo, all vs Pax, weather swapped in): shots stage-fire/water/earth/air.png. Each has a distinct palette and weather banner (SUN, RAIN, SAND, GALE) with buff/debuff chips under the HUD.
- Super (Curomo): super-1.png and super-2.png show a 96 hit, fan burst and rings, foe chips TIDE / STUN / STONESKIN.
- 2v2 and tag: 2v2-before.png (partner portraits TAG-labelled over the HUD, 3 HITS / 30 DMG counter), tag-1.png ("Can't swap: stunned" when stunned), tag-clean-1.png (TAG! call, entrance chevrons, 2.7 s cooldown on the benched portrait, Pax now in).
- Menu, Versus picker, Tour picker (Play) and Help at 1280 and 568: main-d1280.png, arcade-d1280.png, tour-d1280.png, help-p568.png (Jump to row has a chevron).

## New findings

1. Portrait 390x844 fight layout unchanged: tiny arena strip with large black dead area above, action bar wraps into two rows over the arena, four foe status chips stacked. Suggest single-row bar and a two-chip cap, or using the dead area for the arena.
2. The first-blood hint ("First blood ... Got it") overlays the lower arena for the whole of the early fight on desktop and covers the floor between the fighters and the bar; it dims during a tag but stays. Consider auto-dismiss after the first hit.
3. Versus picker at 1280x720: the roster is cut by the fixed Fight/Back bar (Fire row half hidden, "More below" cue present). Works, but the arena options, team size and AI level take about 45 percent of the height before any hero shows.
4. Earth stage looks yellow-green and flat next to the other three (low contrast between floor and the pale crystal prop); an SF-style backdrop with depth would help.
5. Port 7980 was already in use by another agent; Playwright's webServer fails on a taken port, so QA runs need a distinct E2E_PORT.

## Menu / Help / Settings

Five entries (Play, Versus, Online, Settings, Help) at 1280, 844, 667, 568 and 390 portrait; scrollWidth equals clientWidth everywhere; every entry opens; version stamp d38905bf shown.

## Gaps

Round-end screen and a full Tour run not played; lint, typecheck, vitest not run.
