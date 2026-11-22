---
status: done
triaged: superseded (rechecked in r72/r73/r119, open art items tracked elsewhere)
added: 2026-11-16
---

# QA r71: findings (main 7ea52938)

Screenshots: ~/claudetmp/qa-r71/ (f-<me>-<foe>-{intro,fight}.png, s-*.png, sup-*.png, tag-*.png, ph-port-*.png, ph-land-*.png, portsheet.png, landsheet.png, card-*.png, nav-*.png).

## Good

- Restored originals read as a coherent roster; info cards match their abilities.
- Cyclonius is fixed to a single look across picker, HUD and arena.
- HUD is clean: bars, numeric HP, super pips, status chips, weather bar, combo counters.
- Tag swap and 2v2 picker work; no console errors anywhere; e2e subset 22/22.

## Weak

1. Treenoc is still translucent with a pale halo (Earth, f-rokcore-treenoc-intro.png) and blocky at tick 30 (f-treenoc-cyclonius-intro.png); fades in over ~40 ticks after tag-in (tag-1..3.png).
2. Air stage: Cyclonius and Echo are pale blue on blue-violet, low contrast (f-cyclonius-echo-fight.png).
3. Super: the name band crosses the fighters' feet; the depth step is too subtle to notice next to the zoom pulse (s-*, sup-*). Rokcore's super whiffs at range with a translucent caster.
4. Floating "FIRE x2 / AIR x2 / WATER +HP" tags sit on heroes and clip at the screen edge ("RE x2").
5. Wispera is a plain glowing orb; Echo and Cyclonius icons are both white-blue tornados.
6. Versus picker is cramped at 720p and on phone (More-below cue, cut-off fire row; 2v2 cards packed).
7. 2v2 tag portraits overlap the lower HUD area.
8. Phone portrait: Rotate overlay blocks everything; landscape HUD text is tiny and the first-run hint card overlaps the fight.
9. Tour arena fight was not reached by the script (stage card only).

## Suggested follow-ups

- Make Treenoc opaque from tick 0 and on tag-in (tint flash instead of alpha fade); remove the halo.
- Add a rim light or outline for pale heroes on the Air floor, or darken the Air floor under them.
- Move the super name band above the fighters; make the caster dip larger or add a ground shadow pulse.
- Anchor element tags to the HUD or clamp them inside the screen and away from heroes.
- Give Wispera a body; differentiate Echo and Cyclonius icons by hue.
- Compact the Versus picker (collapse info card) for 720p and phones.
- Raise phone HUD font size; shrink or auto-dismiss the hint card.
- Add a Tour arena screenshot to the QA script (click FIGHT on the stage card).

## Triage 2026-11-21 (code-checked)

Fixed (confirmed in r72): Treenoc opaque on tag-in, element tags off heroes, super band clear of the fighters. Tracked elsewhere: Rokcore super whiffing at range (`ideas/brainstorm/qa-r71-rokcore-super-whiffs.md`); Echo pale on the Air floor (`ideas/done/qa-r129-echo-pale-on-air-floor.md`); Versus picker cramped at 720p (r119 triage: footer pill). Dropped (phone): item 8 and phone HUD size.
Art only, noted: Treenoc pale with a halo on the Earth floor, Wispera as a plain orb (`ideas/brainstorm/qa-r127-tour-foe-scale-wispera.md`), Echo and Cyclonius icons both white-blue.
