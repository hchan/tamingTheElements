---
status: idea
added: 2026-11-14
---

# QA r37: capture a clean plain-hit frame sequence for hit-feel review

The QA harness (~/claudetmp/qa37/play.mjs `hit` mode) places both fighters at x 800/900 and they overlap, hiding recoil and hit-stop. Add a stable e2e/tool that places fighters at melee range without overlap, fires one strike, and saves frames at ticks 0,1,2,4,8,16 (hit-stop, recoil distance, spark, number, streak). That would let reviewers score plain-hit weight objectively instead of from stills.
