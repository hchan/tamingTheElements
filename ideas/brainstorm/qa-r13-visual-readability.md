---
status: idea
added: 2026-11-14
---

# Readability and art notes (r13)

Play screen: the "More heroes below" pill overlaps the hero stat row at 1280x720 and the intro paragraph is long (02-play.png). Echo and Pax have low contrast on the air stage (20-stage-air-a.png). Rokcore sprite looks lower-res than Pax or Sindarosa. 2v2 bench portraits are small and crowd the round pips (40-2v2.png). Tour stage card on phone landscape is cut off at the top, so the title and Fight are hard to see together (52-tour-phone.png).

Fix: add a rim light or outline on air stages, re-bake Rokcore at the same density, enlarge bench portraits, and fit the Tour card to 390 px height.

## Progress (2026-11-14)

Done: "More heroes below" pill sits inside the sticky bar at >=900px; Tour stage card fits phone landscape (844x390); bench chips enlarged 56 to 68 px (slim-hud, tag-fx, tests).
Open: Echo/Pax air-stage contrast (Echo already has a pale additive glow; a normal-blend rim for the bright Arcade air floor is not done), Rokcore re-bake. Status stays idea.
