---
status: idea
added: 2026-11-14
---

# QA r26: super banner shows hero portrait in a hard black square; payoff reads small

Repro: `hero=fiara&foe=rokcore`, place heroes, `step(1,[1<<13,0])`, stepLive 6 and 20. The PHOENIX RISE banner puts the portrait in an opaque black square against a translucent banner. 30 ticks later Rokcore had lost only 28 of 321 HP, so the cinematic overpromises.

Evidence: `~/claudetmp/qa26/super-fiara-6.png`, `super-fiara-20.png`, `super-fiara-30.png`. Related: qa-r4-super-banner-covers-fight.

Suggest a feathered or masked portrait and a stronger damage or screen payoff.
