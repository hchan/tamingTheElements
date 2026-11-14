---
status: idea
added: 2026-11-14
---

# Readability and art notes (r13)

Play screen: the "More heroes below" pill overlaps the hero stat row at 1280x720 and the intro paragraph is long (02-play.png). Echo and Pax have low contrast on the air stage (20-stage-air-a.png). Rokcore sprite looks lower-res than Pax or Sindarosa. 2v2 bench portraits are small and crowd the round pips (40-2v2.png). Tour stage card on phone landscape is cut off at the top, so the title and Fight are hard to see together (52-tour-phone.png).

Fix: add a rim light or outline on air stages, re-bake Rokcore at the same density, enlarge bench portraits, and fit the Tour card to 390 px height.

Progress 2026-11-14 (Rokcore density): Rokcore was an 80 px procedural sprite upscaled ~3x, so it read blurry beside the 240 px Pax/Sindarosa portrait rigs. `tools/assets/rig-gen/rokcore.py` now paints at 8x and bakes a 240 px frame rig (`elemental.build(art=6)`: res 2, ss2, box = whole frame) with finer pitted-stone grain, so the density matches. Shots in ~/claudetmp/rokshots/{before,after2}. Other items in this file (air-stage rim light, bench portraits, Tour card) are still open.
## Progress (2026-11-14)

Done: "More heroes below" pill sits inside the sticky bar at >=900px; Tour stage card fits phone landscape (844x390); bench chips enlarged 56 to 68 px (slim-hud, tag-fx, tests).
Open: Echo/Pax air-stage contrast (Echo already has a pale additive glow; a normal-blend rim for the bright Arcade air floor is not done), Rokcore re-bake. Status stays idea.

Progress 2026-11-14 (air contrast): `CharacterView.placeAura` adds a normal-blend deep-indigo soft aura behind every hero (above the additive glow, below the sprite; presentation only). It gives Echo and Pax a dark edge on the bright air floor and tames Echo's blown-out additive glow; fire, water and earth floors are unchanged to the eye. Before/after shots (echo, pax on all four stages) in ~/claudetmp/aircontrast/{before,after}. Remaining open: Rokcore re-bake verification only; status stays idea.

Progress 2026-11-14 (echo-air-contrast): on the air stage Echo and Wispera drop the additive pale glow/halo (it washed out on the bright floor) and get a deeper, wider indigo aura (setBrightFloor in character-view.ts, fed by Arena from the arcade stage). Phone-portrait Versus picker now has a slim fade plus a small gold chevron above the Fight bar (main.css) as a scroll hint. Bench portraits vs SUPER label on phone remain open (qa-r12-touch-fight-layout). Shots in ~/claudetmp/air.
