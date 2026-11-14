---
status: done
added: 2026-11-14
---

# QA r28: hazards have no warning text; earth warning nearly invisible

Reproduced twice on all four stages (hazard-desk-{fire,water,earth,air}-warn.png in ~/claudetmp/qa28/shots/). The warn phase shows only an outline, chevrons and a faint glow. No warning text except air's "GALE 3s" chip. Earth warn alpha is about 0.19 and reads as nothing; fire is a pale right-edge column with a diagonal sun-beam artifact; water and air chevrons (133 and 80) are dense and busy.

Idea: a short label chip per stage (BLAZE, FLOOD, QUAKE, GALE) with countdown, and raise the earth warn contrast.

Progress 2026-11-14: done. Every hazard warning now has a chip (LAVA, TIDE, ROCKFALL, GUST plus whole seconds left) above the box, drawn above the fighters; the earth warning is a brighter fill with a pale double outline and a darker shadow disc. The fire diagonal hatch and glow column are gone, and the SUN weather ray wedges (the actual sun-beam) are no longer drawn.
