---
status: idea
added: 2026-11-14
---

# QA r28: hazards have no warning text; earth warning nearly invisible

Reproduced twice on all four stages (hazard-desk-{fire,water,earth,air}-warn.png in ~/claudetmp/qa28/shots/). The warn phase shows only an outline, chevrons and a faint glow. No warning text except air's "GALE 3s" chip. Earth warn alpha is about 0.19 and reads as nothing; fire is a pale right-edge column with a diagonal sun-beam artifact; water and air chevrons (133 and 80) are dense and busy.

Idea: a short label chip per stage (BLAZE, FLOOD, QUAKE, GALE) with countdown, and raise the earth warn contrast.
