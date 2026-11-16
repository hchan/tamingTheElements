---
status: idea
added: 2026-11-16
---

# QA r71: scorecard (main 7ea52938, headless Playwright, screenshots in ~/claudetmp/qa-r71/)

## Scores (0-5, vs Street Fighter / MvC)

| Axis | r70 | r71 | Why |
|---|---|---|---|
| Fun | 3 | 3 | Hits, combo counters, supers, tag swap all work; still no knockback or hitstop you can see in stills, and the super name band covers the fighters. |
| Graphics | 3.5 | 3.5 | Originals restored and consistent (Cyclonius now one look); Treenoc still ghosted and Air stage contrast is low. Wispera is a plain blue orb. |
| Readability | 3.5 | 3.5 | HUD is clean; floating element tags still clip and sit on heroes; Cyclonius/Echo vanish into the Air floor. |

## Checks

- Menu: exactly Play, Versus, Online, Settings, Help. PASS. No banned words seen.
- Picker, info cards and icons for Rokcore, Lavax, Ishimi, Morblass, Echo, Wispera, Cyclonius, Treenoc, Fiara: correct originals. PASS.
- 1v1 in Fire, Water, Earth, Air (9 pairings): zero console or page errors. PASS.
- Cyclonius three-look problem: FIXED (one blue tornado-dragon in picker, HUD, arena).
- Treenoc shards: PARTLY FIXED. Whole in the fight; at the round-start banner (tick 30) still blocky with a staircase edge; after a tag-in it fades in translucent.
- Super depth step: present but subtle; hard to isolate from the 1.06 to 1.135 zoom pulse. Caster dips slightly, shadow stays beneath.
- Tag swap (2v2): works, "TAG!" banner, bench HP and cooldown shown. PASS.
- Tour: stage card "STAGE 1 OF 9" shows; arena fight not captured.
- Help: sections render and read well at 1280x720.
- Phone 390x844: Rotate overlay with "Play anyway"; Versus picker is cramped, cut-off with "More below". Arena behind the overlay is unusable.
- Phone 844x390: arena plays, touch stick, Strike 1/2 and action bar present; HUD text tiny, hint card overlaps arena.
- e2e subset (arena-smoke, app-flow, arcade-tag, arcade-super, hero-picker-layout, E2E_PORT=7971): 22 passed.
