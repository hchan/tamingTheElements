---
status: done
triaged: superseded (art items noted, rest fixed or dropped)
added: 2026-11-16
---

# QA r72: findings (main 49b837c6)

Screenshots: ~/claudetmp/qa-r72/ (f-<me>-<foe>-{intro,fight}.png, s-*.png, sup-*.png, tag-*.png, tour-1/2.png, nav-*.png, ph-port-*.png, ph-land-*.png, ph-s667-*.png, menu.png).

## Fixed since r71

- Treenoc round intro on Water: opaque and solid; tag-in no longer fades in translucent.
- Element tags ("FIRE x2", "AIR x2", "WATER +HP") sit on the floor, away from heroes, no edge clipping seen.
- Super name band clear of the fighters; depth step reads as a caster dip with ground markers.
- Phone landscape 844x390 gutter keeps Strike and Pause off the foe.
- Tour arena fight now reachable and looks right (tour-2.png).

## Weak

1. Treenoc on the Earth floor at round intro is still pale grey with a halo (f-rokcore-treenoc-intro.png).
2. Echo is a translucent ghost on the Air floor (f-cyclonius-echo-fight.png); Cyclonius is better but both are pale on pale-blue.
3. Wispera is still a plain glowing orb (tour-2.png, picker); Echo and Cyclonius icons still similar white-blue.
4. Phone 667x375: Strike buttons overlap the arena edge and an element tag (ph-s667-arena1.png); first-run hint card covers the top-left of the fight at both phone sizes.
5. Play picker at 720p: "More below" cue and Earth row cut off (nav-Play.png).
6. Hit stills show no knockback or hitstop; fights are readable but static, limiting Fun.
7. Portrait phone: Rotate overlay blocks everything until "Play anyway".

## Suggested follow-ups

- Rim light or darker floor patch under pale heroes (Echo, Cyclonius, Treenoc on Earth).
- Widen the 667x375 gutter like 844x390 and auto-dismiss the hint card.
- Give Wispera a body or silhouette; recolour Echo or Cyclonius icon.
- Add visible knockback / hitstop frames to hit feel.

## Triage 2026-11-21 (code-checked)

Fixed in this round or after: Treenoc opaque, element tags, super band, 844x390 gutter, Tour arena reachable. Dropped (phone): items 4 and 7. Tracked elsewhere: "More below" cue at 720p (r119 triage, fixed in `src/ui/styles/main/10-picker-layout.css`); hit stills showing no knockback or hit-stop: hit-stop confirmed working in r119 (N4).
Art only, noted: Treenoc grey with a halo on the Earth floor, Echo as a ghost on Air (`ideas/done/qa-r129-echo-pale-on-air-floor.md`), Wispera orb, Echo/Cyclonius icons close in hue.
